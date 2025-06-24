import React, { useState, useMemo, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    onAuthStateChanged, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup
} from 'firebase/auth';
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc,
    writeBatch
} from 'firebase/firestore';

// --- Firebase Configuration ---
// This is your actual Firebase config object
const firebaseConfig = {
  apiKey: "AIzaSyBYSRSouJXL86F_u81mlVRPZecZu0Rm5bc",
  authDomain: "crosstraining-app-1f4a4.firebaseapp.com",
  projectId: "crosstraining-app-1f4a4",
  storageBucket: "crosstraining-app-1f4a4.appspot.com",
  messagingSenderId: "35781354566",
  appId: "1:35781354566:web:58e9871041c64209ccd647",
  measurementId: "G-KFSGCJK4RL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// --- DATA STRUCTURE ---
const foodData = {
  proteins: { title: "Proteínas", iconClass: "fa-solid fa-drumstick-bite", items: ["Pechuga de pollo", "Huevo con yema", "Perniles de pollo", "Carne de res baja en grasa", "Hígado", "Mojarra", "Atún", "Merluza", "Trucha", "Salmón", "Camarones", "Pavo", "Codorniz", "Bagre", "Mero", "Tilapia", "Robalo", "Cachama", "Cerdo magro", "Mariscos", "Dorada", "Yogur griego (sin fruta, sin azúcar)", "Quesos bajos en grasa", "Cuajada", "Quinua"] },
  vegetables: { title: "Verduras y Vegetales", iconClass: "fa-solid fa-leaf", items: ["Pepino", "Tomate", "Acelgas", "Lechuga", "Repollo", "Pimentón", "Espinaca", "Brócoli", "Coliflor", "Apio en rama", "Berenjena", "Calabacín", "Champiñones", "Rábano", "Escarragos", "Habichuela", "Perejil", "Cilantro", "Zanahoria", "Cebolla", "Aguacate", "Espárragos", "Yota"] },
  carbohydrates: { title: "Carbohidratos", iconClass: "fa-solid fa-wheat-awn", items: ["Arroz", "Papa", "Mazorca-maíz", "Plátano", "Yuca", "Arepas", "Pasta", "Pan integral o blanco", "Cereales", "Frijoles", "Lentejas", "Avena", "Tortillas", "Tostadas integrales o blancas", "Garbanzos", "Arvejas", "Arracachas"] },
  fats: { title: "Grasas Saludables", iconClass: "fa-solid fa-droplet", items: ["Aguacate", "Aceite de oliva", "Mantequilla de leche de vaca", "Nueces", "Almendras", "Macadamias", "Aceite de coco", "Semillas de girasol", "Pistachos"] },
};

const otherFoods = {
  beverages: ["Agua", "Agua con limón", "Tinto sin azúcar", "Aromáticas sin dulce", "Tés de infusión"],
};


// --- HELPER FUNCTIONS ---
const callGeminiAPI = async (prompt) => {
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
    if (!apiKey) {
        return "Error: Clave de API no encontrada. Asegúrate de configurar tu archivo .env.";
    }
    try {
        const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { contents: chatHistory };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) {
            const errorBody = await response.text();
            return `Error: ${response.status}. No se pudo conectar con el servicio de IA.`;
        }
        const result = await response.json();
        if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
            return result.candidates[0].content.parts[0].text;
        } else {
            return "No se pudo obtener una respuesta con el formato esperado.";
        }
    } catch (error) {
        return "Hubo un error de red al generar la respuesta.";
    }
};

const levenshteinDistance = (a, b) => {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i += 1) { matrix[0][i] = i; }
    for (let j = 0; j <= b.length; j += 1) { matrix[j][0] = j; }
    for (let j = 1; j <= b.length; j += 1) {
        for (let i = 1; i <= a.length; i += 1) {
            const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + indicator);
        }
    }
    return matrix[b.length][a.length];
};

const getRandomItem = (arr, excluded = []) => {
    const available = arr.filter(item => !excluded.includes(item));
    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
};
const getEquivalentOptions = (arr, mainItem, excluded = [], count = 2) => {
    const available = arr.filter(item => !excluded.includes(item) && item !== mainItem);
    const equivalents = [];
    for (let i = 0; i < count; i++) {
        if (available.length > 0) {
            const randomIndex = Math.floor(Math.random() * available.length);
            equivalents.push(available[randomIndex]);
            available.splice(randomIndex, 1);
        }
    }
    return equivalents;
};

// --- MEAL PLAN GENERATION LOGIC ---
const generateMealPlan = (preferences) => {
    const { excludedFoods, isEctomorph, customRestrictions } = preferences;
    const mealPlan = [];
    const filterFoodList = (list) => {
      return list.filter(food => {
        if (excludedFoods.includes(food)) { return false; }
        const foodLower = food.toLowerCase();
        for (const restriction of customRestrictions) {
          if (!restriction) continue;
          const distance = levenshteinDistance(foodLower, restriction);
          const threshold = restriction.length < 5 ? 1 : 2;
          if (distance <= threshold) { return false; }
        }
        return true;
      });
    };
    const available = {
        proteins: filterFoodList(foodData.proteins.items),
        vegetables: filterFoodList(foodData.vegetables.items),
        carbohydrates: filterFoodList(foodData.carbohydrates.items),
        fats: filterFoodList(foodData.fats.items),
    };
    for (let day = 1; day <= 7; day++) {
        const dailyPlan = { day: `Día ${day}`, breakfast: {}, lunch: {}, dinner: {}, snacks: [], beverages: [...otherFoods.beverages], notes: [] };
        const carbPortionText = isEctomorph ? "porción más grande (aumento de masa)" : "máx. 1/4 del plato";
        if ((day - 1) % 5 === 4) { dailyPlan.notes.push("Dia trampa, disfruta de algo rico pero con moderación."); }
        const generateSingleMeal = () => {
            const mainProtein = getRandomItem(available.proteins);
            const mainVeggie1 = getRandomItem(available.vegetables);
            const mainVeggie2 = getRandomItem(available.vegetables, [mainVeggie1]);
            const mainCarb = getRandomItem(available.carbohydrates);
            const mainFat = getRandomItem(available.fats);
            return {
                protein: { main: mainProtein, equivalents: getEquivalentOptions(available.proteins, mainProtein) },
                vegetables: { main: mainVeggie1 && mainVeggie2 ? `${mainVeggie1}, ${mainVeggie2}` : (mainVeggie1 || 'Verduras'), equivalents: getEquivalentOptions(available.vegetables, mainVeggie1 ? [mainVeggie1, mainVeggie2] : []) },
                carbohydrates: { main: mainCarb, equivalents: getEquivalentOptions(available.carbohydrates, mainCarb), portion: carbPortionText },
                fats: { main: mainFat, equivalents: getEquivalentOptions(available.fats, mainFat), portion: "porción pequeña" },
            };
        };
        dailyPlan.breakfast = generateSingleMeal();
        dailyPlan.lunch = generateSingleMeal();
        dailyPlan.dinner = generateSingleMeal();
        const potentialSnacks = [];
        potentialSnacks.push("Agua (mucha, al menos medio litro)");
        potentialSnacks.push("Café o té sin azúcar");
        if (available.proteins.includes("Cuajada")) { potentialSnacks.push("Cuajada (máximo 200g)"); }
        if (available.fats.some(f => ["Almendras", "Nueces", "Macadamias"].includes(f))) { potentialSnacks.push("Frutos secos (máximo 25g)"); }
        const shuffledSnacks = potentialSnacks.sort(() => 0.5 - Math.random());
        dailyPlan.snacks = shuffledSnacks.slice(0, 2);
        mealPlan.push(dailyPlan);
    }
    return mealPlan;
};

// --- AUTHENTICATION FLOW COMPONENTS ---

const LoginScreen = ({ onGoToRegister }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleEmailSignIn = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            setError("Credenciales incorrectas. Por favor, inténtalo de nuevo.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setError('');
        setIsLoading(true);
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (!userDoc.exists()) {
                await signOut(auth);
                setError("No existe una cuenta asociada a este perfil de Google. Por favor, regístrate primero.");
            }
        } catch (err) {
            setError("Error al iniciar sesión con Google. Inténtalo de nuevo.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md mx-auto bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-2xl">
            <h2 className="text-3xl font-bold text-center text-gray-800 mb-6">Iniciar Sesión</h2>
            <form onSubmit={handleEmailSignIn} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Correo Electrónico</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" required />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" required />
                </div>
                <button type="submit" disabled={isLoading} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                    {isLoading ? 'Ingresando...' : 'Entrar'}
                </button>
            </form>
            <div className="mt-6 relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-300" /></div><div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-500">O</span></div></div>
            <div className="mt-6">
                <button onClick={handleGoogleSignIn} disabled={isLoading} className="w-full flex justify-center items-center gap-3 py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
                    <i className="fa-brands fa-google"></i> Iniciar sesión con Google
                </button>
            </div>
            {error && <p className="mt-4 text-red-500 text-sm text-center">{error}</p>}
            <p className="mt-4 text-center text-sm text-gray-600">¿No tienes una cuenta? <button onClick={onGoToRegister} className="font-medium text-blue-600 hover:text-blue-500 ml-1">Regístrate</button></p>
        </div>
    );
};

const RegistrationFlow = ({ onCancel }) => {
    const [step, setStep] = useState('cedula'); // 'cedula', 'details'
    const [validatedCedula, setValidatedCedula] = useState(null);

    const handleCedulaValidated = (cedula) => {
        setValidatedCedula(cedula);
        setStep('details');
    };

    if (step === 'cedula') {
        return <CedulaCheckScreen onCedulaValidated={handleCedulaValidated} onCancel={onCancel} />;
    }
    if (step === 'details') {
        return <RegistrationDetailsScreen validatedCedula={validatedCedula} onCancel={onCancel} />;
    }
    return null;
};

const CedulaCheckScreen = ({ onCedulaValidated, onCancel }) => {
    const [cedula, setCedula] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleCheck = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        if (!cedula.trim()) {
            setError('Por favor, ingresa tu número de cédula.');
            setIsLoading(false);
            return;
        }
        const cedulaRef = doc(db, "validCedulas", cedula);
        const cedulaSnap = await getDoc(cedulaRef);
        if (cedulaSnap.exists()) {
            if (cedulaSnap.data().isClaimed) {
                setError('Esta cédula ya ha sido registrada por otro usuario.');
            } else {
                onCedulaValidated(cedula);
            }
        } else {
            setError('Cédula no encontrada en nuestra base de datos.');
        }
        setIsLoading(false);
    };

    return (
         <div className="w-full max-w-md mx-auto bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-2xl">
            <h2 className="text-3xl font-bold text-center text-gray-800 mb-2">Paso 1: Verificación</h2>
            <p className="text-center text-gray-600 mb-6">Ingresa tu cédula para iniciar tu registro.</p>
            <form onSubmit={handleCheck} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Número de Cédula</label>
                    <input type="text" value={cedula} onChange={e => setCedula(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" required />
                </div>
                {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                <button type="submit" disabled={isLoading} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                    {isLoading ? 'Verificando...' : 'Verificar Cédula'}
                </button>
                 <button type="button" onClick={onCancel} className="w-full text-center text-sm text-gray-500 hover:text-gray-700 mt-2">Volver al inicio de sesión</button>
            </form>
        </div>
    );
};

const RegistrationDetailsScreen = ({ validatedCedula, onCancel }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [sede, setSede] = useState('Ciudadela');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const completeRegistration = async (user, displayName) => {
        const batch = writeBatch(db);
        const userDocRef = doc(db, "users", user.uid);
        batch.set(userDocRef, {
            name: displayName,
            email: user.email,
            sede: sede,
            cedula: validatedCedula
        });
        const cedulaRef = doc(db, "validCedulas", validatedCedula);
        batch.update(cedulaRef, { isClaimed: true, claimedBy: user.uid, claimedAt: new Date() });
        await batch.commit();
    };

    const handleEmailSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (name.trim() === '') { setError('Por favor, ingresa tu nombre.'); return; }
        setIsLoading(true);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCredential.user, { displayName: name });
            await completeRegistration(userCredential.user, name);
        } catch (err) {
            setError(err.code === 'auth/email-already-in-use' ? 'Este correo ya está registrado.' : err.message);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleGoogleRegister = async () => {
        setError('');
        setIsLoading(true);
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;
            await completeRegistration(user, user.displayName);
        } catch (err) {
             setError(err.code === 'auth/account-exists-with-different-credential' ? 'Ya existe una cuenta con este correo electrónico.' : 'Error al registrar con Google.');
             await signOut(auth); // Sign out if registration fails to avoid inconsistent states
        } finally {
            setIsLoading(false);
        }
    };

    return (
         <div className="w-full max-w-md mx-auto bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-2xl">
            <h2 className="text-3xl font-bold text-center text-gray-800 mb-6">Paso 2: Completa tu Perfil</h2>
            <form onSubmit={handleEmailSubmit} className="space-y-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-700">Nombre Completo</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" required />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Correo Electrónico</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" required />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" required />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Sede</label>
                    <select value={sede} onChange={e => setSede(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm">
                        <option>Ciudadela</option>
                        <option>Florida</option>
                        <option>Piedecuesta</option>
                    </select>
                </div>
                <button type="submit" disabled={isLoading} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                    {isLoading ? 'Registrando...' : 'Finalizar Registro'}
                </button>
            </form>
            <div className="mt-6 relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-300" /></div><div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-500">O</span></div></div>
            <div className="mt-6">
                 <button onClick={handleGoogleRegister} disabled={isLoading} className="w-full flex justify-center items-center gap-3 py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
                    <i className="fa-brands fa-google"></i> Registrarse con Google
                </button>
            </div>
            {error && <p className="mt-4 text-red-500 text-sm text-center">{error}</p>}
            <button onClick={onCancel} className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700">Cancelar Registro</button>
        </div>
    );
};

const AuthFlow = () => {
    const [isRegistering, setIsRegistering] = useState(false);

    if (isRegistering) {
        return <RegistrationFlow onCancel={() => setIsRegistering(false)} />;
    }
    return <LoginScreen onGoToRegister={() => setIsRegistering(true)} />;
};

// Other components (Sidebar, Header, Dashboard, etc.) remain mostly the same
const Sidebar = ({ user, userData, isOpen, onClose }) => {
    if (!user) return null;
    const handleLogout = async () => { await signOut(auth); };
    return (
        <>
            <div className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onClose}></div>
            <div className={`fixed top-0 left-0 h-full w-72 bg-white shadow-2xl z-50 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="p-6">
                    <div className="flex items-center mb-6">
                        <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'U'}&background=random`} alt="Perfil" className="w-16 h-16 rounded-full mr-4" />
                        <div>
                            <p className="font-bold text-lg text-gray-800">{user.displayName}</p>
                            <p className="text-sm text-gray-600">{userData?.sede || 'Sede no asignada'}</p>
                        </div>
                    </div>
                    <nav className="space-y-2">
                        <button className="w-full text-left p-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"><i className="fa-solid fa-pen-to-square mr-3"></i>Editar Perfil (Pronto)</button>
                        <button onClick={handleLogout} className="w-full text-left p-3 rounded-lg text-red-500 hover:bg-red-50 transition-colors"><i className="fa-solid fa-right-from-bracket mr-3"></i>Cerrar Sesión</button>
                    </nav>
                </div>
            </div>
        </>
    );
};

const Header = ({ onMenuClick }) => (
    <header className="bg-white/80 backdrop-blur-sm shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
                <button onClick={onMenuClick} className="text-gray-600 hover:text-gray-800"><i className="fa-solid fa-bars text-2xl"></i></button>
                <h1 className="text-xl font-bold text-gray-800">Tu Dashboard</h1>
                <div></div>
            </div>
        </div>
    </header>
);

const Dashboard = ({ user }) => {
    const [preferences, setPreferences] = useState(null);
    const [savedPlan, setSavedPlan] = useState(null);
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const fetchUserDataAndPlan = async () => {
            if (user) {
                const userDocRef = doc(db, "users", user.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) { setUserData(userDocSnap.data()); }
                const planDocRef = doc(db, "mealPlans", user.uid);
                const planDocSnap = await getDoc(planDocRef);
                if (planDocSnap.exists()) { setSavedPlan(planDocSnap.data().plan); }
                setIsLoading(false);
            }
        };
        fetchUserDataAndPlan();
    }, [user]);

    const handleSavePlan = async (plan) => {
        if (user) {
            await setDoc(doc(db, "mealPlans", user.uid), { plan });
            setSavedPlan(plan);
            setPreferences(null);
        }
    };

    const mealPlan = useMemo(() => {
        if (preferences) return generateMealPlan(preferences);
        return null;
    }, [preferences]);

    if(isLoading) {
        return <div className="flex justify-center items-center h-screen"><div className="w-16 h-16 rounded-full animate-spin border-4 border-dashed border-blue-500 border-t-transparent"></div></div>
    }

    return (
        <div className="flex flex-col h-screen w-full">
            <Header onMenuClick={() => setSidebarOpen(true)} />
            <Sidebar user={user} userData={userData} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <main className="flex-grow p-4 sm:p-8">
                {!savedPlan && !mealPlan && (
                    <div className="text-center">
                        <h2 className="text-2xl font-bold mb-4">¡Bienvenido, {user.displayName}!</h2>
                        <p className="mb-6">Parece que aún no tienes un plan de comidas. ¡Vamos a crear uno!</p>
                        <PreferencesForm onSubmit={setPreferences} />
                    </div>
                )}
                {mealPlan && (
                    <>
                         <MealPlanDisplay mealPlan={mealPlan} />
                         <div className="text-center mt-6 space-x-4">
                             <button onClick={() => setPreferences(null)} className="px-8 py-4 bg-gray-600 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-gray-700">Cancelar</button>
                            <button onClick={() => handleSavePlan(mealPlan)} className="px-8 py-4 bg-green-600 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-green-700">Guardar este Plan</button>
                        </div>
                    </>
                )}
                 {savedPlan && !mealPlan &&(
                    <>
                        <MealPlanDisplay mealPlan={savedPlan} />
                        <div className="text-center mt-6">
                             <button onClick={() => {setSavedPlan(null); setPreferences(null)}} className="px-8 py-4 bg-blue-600 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-blue-700">Generar un Nuevo Plan</button>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
};


// --- EXISTING UI COMPONENTS (ADAPTED) ---
const FormattedAIResponse = ({ content }) => {
    const formattedContent = useMemo(() => {
        if (!content || typeof content !== 'string') return null;
        const lines = content.split('\n').filter(line => line.trim() !== '');
        return lines.map((line, index) => {
            if (line.match(/^(Ingredientes|Pasos|Instrucciones|Sugerencia):/i) || line.trim().endsWith(':')) { return <h4 key={index} className="text-md font-bold text-gray-800 mt-3 mb-2">{line}</h4>; }
            if (line.match(/^[-*]|\d+\./)) { return <li key={index} className="ml-5">{line.replace(/^[-*]|\d+\./, '').trim()}</li>; }
            return <p key={index} className="mb-2">{line}</p>;
        });
    }, [content]);
    return <div className="text-sm text-gray-700 w-full">{formattedContent}</div>;
};

const AIModal = ({ isOpen, onClose, title, isLoading, content, error }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-md m-auto animate-fade-in-up" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center"><h3 className="text-xl font-bold text-gray-800">{title}</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-800 transition-colors"><i className="fa-solid fa-xmark text-2xl"></i></button></div>
                <div className="border-t border-gray-200 my-4"></div>
                <div className="min-h-[150px] flex flex-col justify-center items-center">
                    {isLoading && (<div className="text-center"><div className="w-12 h-12 rounded-full animate-spin border-4 border-dashed border-blue-500 border-t-transparent mx-auto"></div><p className="mt-4 text-gray-600">Pensando...</p></div>)}
                    {error && <div className="text-center text-red-600 bg-red-100 p-4 rounded-lg"><i className="fa-solid fa-circle-exclamation mr-2"></i>{error}</div>}
                    {!isLoading && !error && content && <FormattedAIResponse content={content} />}
                </div>
            </div>
        </div>
    );
};

const FoodTag = ({ item, isSelected, onToggle }) => (
    <button type="button" onClick={() => onToggle(item)} className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-all duration-200 ease-in-out transform hover:scale-105 ${isSelected ? 'bg-red-500 border-red-600 text-white shadow-md' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'}`}>{item}</button>
);

const PreferencesForm = ({ onSubmit }) => {
    const [isEctomorph, setIsEctomorph] = useState(false);
    const [excludedFoods, setExcludedFoods] = useState([]);
    const [customRestrictions, setCustomRestrictions] = useState("");
    const handleToggleFood = (food) => { setExcludedFoods(prev => prev.includes(food) ? prev.filter(f => f !== food) : [...prev, food]); };
    const handleSubmit = (event) => {
        event.preventDefault();
        const parsedCustom = customRestrictions.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        onSubmit({ isEctomorph, excludedFoods, customRestrictions: parsedCustom });
    };

    return (
        <div className="p-6 sm:p-8 max-w-5xl mx-auto bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200/50">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-8 text-center" style={{ fontFamily: "'Inter', sans-serif" }}>Personaliza tu Plan</h2>
            <form onSubmit={handleSubmit}>
                <div className="mb-8 p-5 bg-blue-50 rounded-xl border border-blue-200 shadow-sm"><label className="flex flex-col sm:flex-row items-start sm:items-center justify-between cursor-pointer gap-4"><div><span className="text-blue-800 text-lg font-medium">¿Eres una persona ectomorfa (muy delgada)?</span><p className="text-sm text-blue-700 mt-1">Si lo seleccionas, tu plan priorizará el aumento de masa muscular con más carbohidratos.</p></div><div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in flex-shrink-0"><input type="checkbox" checked={isEctomorph} onChange={e => setIsEctomorph(e.target.checked)} className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"/><label className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label></div></label></div>
                <div className="mb-6"><h3 className="text-xl font-semibold text-gray-700 mb-4">¿Qué alimentos quieres excluir?</h3><p className="text-sm text-gray-500 mb-5">Selecciona los alimentos que no te gustan o no puedes comer. Aparecerán en rojo.</p>
                    {Object.entries(foodData).map(([key, { title, iconClass, items }]) => (
                        <div key={key} className="mb-6 bg-gray-50/70 p-5 rounded-xl border border-gray-200/80"><h4 className="flex items-center text-lg font-semibold text-gray-700 mb-4"><i className={`${iconClass} w-6 h-6 mr-3 text-gray-500`}></i>{title}</h4><div className="flex flex-wrap gap-2">{items.map(food => (<FoodTag key={food} item={food} isSelected={excludedFoods.includes(food)} onToggle={handleToggleFood} />))}</div></div>
                    ))}
                </div>
                <div className="mb-8 bg-gray-50/70 p-5 rounded-xl border border-gray-200/80"><label htmlFor="customRestrictions" className="block text-lg font-semibold text-gray-700 mb-2">Otras Restricciones / Alergias</label><p className="text-sm text-gray-500 mb-4">Escribe otros alimentos que debamos evitar, separados por comas.</p><textarea id="customRestrictions" value={customRestrictions} onChange={e => setCustomRestrictions(e.target.value)} rows="3" className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base" placeholder="Ej: gluten, lactosa, maní..."></textarea></div>
                <div className="text-center"><button type="submit" className="px-10 py-5 bg-blue-600 text-white font-bold text-xl rounded-xl shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300">Generar Plan</button></div>
            </form>
        </div>
    );
};

const MealPlanDisplay = ({ mealPlan }) => {
    const [modalState, setModalState] = useState({ isOpen: false, title: '', content: null, isLoading: false, error: null });
    const handleAIGeneration = async (type, data) => {
        let title = '', prompt = '';
        switch (type) {
            case 'recipe': title = `Receta para ${data}`; prompt = `Eres un chef experto en comida saludable. Crea una receta sencilla y rápida para preparar "${data}". Responde solo con la receta, usando encabezados como "Ingredientes:" y "Pasos:".`; break;
            case 'snack': title = 'Sugerencia de Snack'; prompt = `Eres un nutricionista creativo. Sugiere una opción de snack saludable y fácil de preparar. Dame solo una sugerencia breve.`; break;
            case 'cheat': title = 'Sugerencia para Día Trampa'; prompt = `Eres un foodie experto en antojos. Sugiere una idea deliciosa para una comida trampa, evitando cadenas de comida rápida.`; break;
            default: return;
        }
        setModalState({ isOpen: true, title, content: null, isLoading: true, error: null });
        const response = await callGeminiAPI(prompt);
        if(response.startsWith("Error:")) { setModalState(prev => ({ ...prev, isLoading: false, error: response })); } 
        else { setModalState(prev => ({ ...prev, isLoading: false, content: response })); }
    };
    const closeModal = () => setModalState({ isOpen: false, title: '', content: null, isLoading: false, error: null });
    const MealItem = ({ iconClass, color, title, meal, portion }) => (
        <div className="flex items-start space-x-3">
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${color.bg}`}><i className={`${iconClass} text-lg ${color.text}`}></i></div>
            <div>
                <p className={`font-bold text-base ${color.text}`}>{title} <span className="text-sm font-normal text-gray-500">({portion})</span></p>
                <p className="text-gray-800 text-base leading-tight">{meal.main || 'No disponible'}</p>
                {meal.equivalents?.length > 0 && <p className="text-sm text-gray-500 italic mt-1">Opciones: {meal.equivalents.join(', ')}</p>}
                {title === 'Proteína' && meal.main && (<button onClick={() => handleAIGeneration('recipe', meal.main)} className="px-3 py-1 mt-2 text-xs font-semibold text-blue-700 bg-blue-100 rounded-full hover:bg-blue-200">Generar Receta</button>)}
            </div>
        </div>
    );
    return (
        <>
            <AIModal isOpen={modalState.isOpen} onClose={closeModal} title={modalState.title} isLoading={modalState.isLoading} content={modalState.content} error={modalState.error} />
            <div className="p-4 sm:p-8 w-full">
                <div className="text-center mb-10"><h2 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-2">Tu Plan Semanal</h2></div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {(mealPlan || []).map((day) => (
                        <div key={day.day} className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 p-6 flex flex-col">
                            <h3 className="text-2xl font-bold text-blue-700 text-center mb-4">{day.day}</h3>
                            {day.notes.length > 0 && (<div className="p-4 bg-purple-100 rounded-lg text-center border border-purple-200 mb-4"><p className="font-semibold text-purple-800 mb-2">{day.notes[0]}</p><button onClick={() => handleAIGeneration('cheat')} className="px-3 py-1 text-xs font-semibold text-purple-700 bg-purple-200 rounded-full hover:bg-purple-300">Sugerir idea</button></div>)}
                            <div className="space-y-6 flex-grow">
                            {[{ name: 'Desayuno', plan: day.breakfast }, { name: 'Almuerzo', plan: day.lunch }, { name: 'Cena', plan: day.dinner }].map(meal => (
                                <div key={meal.name}>
                                    <h4 className="flex items-center text-lg font-bold text-gray-700 mb-3"><i className="fa-solid fa-utensils w-5 h-5 mr-2 text-gray-500"></i>{meal.name}</h4>
                                    <div className="space-y-4">
                                        <MealItem iconClass={foodData.proteins.iconClass} color={{ bg: "bg-blue-100", text: "text-blue-700" }} title="Proteína" meal={meal.plan.protein} portion="150-200gr" />
                                        <MealItem iconClass={foodData.vegetables.iconClass} color={{ bg: "bg-green-100", text: "text-green-700" }} title="Verduras" meal={meal.plan.vegetables} portion="abundante"/>
                                        <MealItem iconClass={foodData.carbohydrates.iconClass} color={{ bg: "bg-yellow-100", text: "text-yellow-700" }} title="Carbohidratos" meal={meal.plan.carbohydrates} portion={meal.plan.carbohydrates.portion}/>
                                        <MealItem iconClass={foodData.fats.iconClass} color={{ bg: "bg-orange-100", text: "text-orange-700" }} title="Grasas" meal={meal.plan.fats} portion={meal.plan.fats.portion}/>
                                    </div>
                                </div>
                            ))}
                            </div>
                             {day.snacks.length > 0 && (<div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200 mt-6"><h4 className="font-bold text-base text-yellow-800 mb-2">Entrecomidas / Ansiedad</h4><ul className="list-disc list-inside text-sm text-yellow-900/80 space-y-1">{day.snacks.map((snack, i) => <li key={i}>{snack}</li>)}</ul><div className="text-center mt-3"><button onClick={() => handleAIGeneration('snack')} className="px-3 py-1 text-xs font-semibold text-yellow-800 bg-yellow-200 rounded-full hover:bg-yellow-300">Sugerir Snack con IA</button></div></div>)}
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
};


// --- MAIN APP COMPONENT ---
function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [authView, setAuthView] = useState('login'); // 'login', 'register'

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    if (loading) {
        return <div className="flex justify-center items-center h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50"><div className="w-16 h-16 rounded-full animate-spin border-4 border-dashed border-blue-500 border-t-transparent"></div></div>
    }

    let content;
    if (user) {
        content = <Dashboard user={user} />;
    } else {
        if (authView === 'login') {
            content = <LoginScreen onGoToRegister={() => setAuthView('register')} />;
        } else {
            content = <RegistrationFlow onCancel={() => setAuthView('login')} />;
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50">
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap'); @import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css'); body { font-family: 'Inter', sans-serif; } .toggle-checkbox:checked { right: 0; border-color: #3B82F6; } .toggle-checkbox:checked + .toggle-label { background-color: #3B82F6; } .animate-fade-in-up { animation: fade-in-up 0.3s ease-out forwards; } @keyframes fade-in-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            <div className="flex justify-center items-center min-h-screen p-4">{content}</div>
        </div>
    );
}

export default App;
