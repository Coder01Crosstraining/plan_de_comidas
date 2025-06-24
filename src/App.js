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
    writeBatch,
    Timestamp,
    serverTimestamp
} from 'firebase/firestore';
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from 'firebase/storage';


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
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

// --- NEW RESTRUCTURED DATA STRUCTURE ---
const foodData = {
    proteins: { 
        title: "Proteínas", 
        iconClass: "fa-solid fa-drumstick-bite", 
        items: [
            "Pechuga de pollo", "Perniles de pollo", "Hígado de res",
            "Carne de res", "Cerdo magro", "Pescado/Mariscos", 
            "Atún en lata", "Sardina en lata", "Huevos", "Quesos", "Cuajada", 
            "Yogur griego (sin azúcar)", "Tofu", "Tempeh", "Seitan"
        ],
        forLunchDinner: [
            "Pechuga de pollo", "Perniles de pollo", "Hígado de res",
            "Carne de res", "Cerdo magro", 
            "Atún en lata", "Tofu", "Tempeh", "Seitan"
        ],
        forBreakfast: ["Huevos", "Quesos", "Cuajada", "Yogur griego (sin azúcar)",
            "Pechuga de pollo", "Perniles de pollo", "Atún en lata", "Sardina en lata",
            "Carne de res", "Cerdo magro"
        ]
    },
    vegetables: { 
        title: "Verduras y Vegetales", 
        iconClass: "fa-solid fa-leaf", 
        items: [
            "Pepino", "Tomate", "Acelgas", "Lechuga", "Repollo", "Pimentón", 
            "Espinaca", "Brócoli", "Coliflor", "Berenjena", "Calabacín", 
            "Champiñones", "Rábano", "Habichuela", "Perejil", "Cilantro", 
            "Zanahoria", "Cebolla", "Espárragos", "Apio para guiso"
        ],
        forBreakfast: ["Tomate", "Cebolla", "Champiñones", "Espinaca", "Pimentón", "Cilantro"],
        saladCombos: [
            "Ensalada de lechuga, tomate y cebolla",
            "Ensalada de espinaca, champiñones y pimentón",
            "Ensalada de pepino, rábano y cilantro",
            "Ensalada de repollo, zanahoria y perejil",
            "Brócoli y coliflor al vapor"
        ]
    },
    carbohydrates: { 
        title: "Carbohidratos", 
        iconClass: "fa-solid fa-wheat-awn", 
        items: [
            "Arroz", "Papa", "Mazorca-maíz", "Plátano verde", "Plátano maduro", "Yuca", "Arepas", 
            "Pasta", "Pan integral", "Frijoles", "Lentejas", "Avena en hojuelas", 
            "Tortillas de maíz", "Tostadas integrales", "Garbanzos", "Arveja", 
            "Arracacha", "Remolacha", "Auyama"
        ] 
    },
    fats: { 
        title: "Grasas Saludables", 
        iconClass: "fa-solid fa-droplet", 
        items: ["Aguacate", "Aceite de oliva", "Mantequilla", "Frutos secos", "Aceite de coco", "Semillas de girasol"] 
    },
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
        const apiUrl = `/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        
        const response = await fetch(apiUrl, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
        });
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

// --- ENHANCED MEAL PLAN GENERATION LOGIC ---
const generateMealPlan = (preferences) => {
    const { excludedFoods, isEctomorph } = preferences;
    const mealPlan = [];
    const filterFoodList = (list) => list.filter(food => !excludedFoods.includes(food));

    const available = {
        proteins: filterFoodList(foodData.proteins.items),
        proteinsForBreakfast: filterFoodList(foodData.proteins.forBreakfast),
        proteinsForLunchDinner: filterFoodList(foodData.proteins.forLunchDinner),
        vegetables: filterFoodList(foodData.vegetables.items),
        vegetablesForBreakfast: filterFoodList(foodData.vegetables.forBreakfast),
        saladCombos: filterFoodList(foodData.vegetables.saladCombos),
        carbohydrates: filterFoodList(foodData.carbohydrates.items),
        fats: filterFoodList(foodData.fats.items),
    };

    for (let day = 1; day <= 7; day++) {
        const dailyPlan = { day: `Día ${day}`, breakfast: {}, lunch: {}, dinner: {}, snacks: [], beverages: [...otherFoods.beverages], notes: [] };
        const carbPortionText = isEctomorph ? "porción más grande (aumento de masa)" : "máx. 1/4 del plato";
        if ((day - 1) % 5 === 4) { dailyPlan.notes.push("Dia trampa, disfruta de algo rico pero con moderación."); }
        
        let usedProteinsToday = [];

        // --- BREAKFAST GENERATION (Improved Logic) ---
        const breakfastProtein = getRandomItem(available.proteinsForBreakfast);
        usedProteinsToday.push(breakfastProtein);

        let breakfastVegs = `${getRandomItem(available.vegetables)}, ${getRandomItem(available.vegetables)}`;
        if (breakfastProtein === "Huevos") {
             const breakfastVeg1 = getRandomItem(available.vegetablesForBreakfast);
             const breakfastVeg2 = getRandomItem(available.vegetablesForBreakfast, [breakfastVeg1]);
             breakfastVegs = `Revueltos con ${breakfastVeg1} y ${breakfastVeg2}`;
        }
        
        dailyPlan.breakfast = {
            protein: { main: breakfastProtein, equivalents: getEquivalentOptions(available.proteinsForBreakfast, breakfastProtein) },
            vegetables: { main: breakfastVegs, equivalents: [] },
            carbohydrates: { main: "Arepa o pan integral", equivalents: ["Tostada integral"], portion: carbPortionText },
            fats: { main: "Aguacate", equivalents: ["Aceite de oliva"], portion: "porción pequeña" },
        };

        // --- LUNCH & DINNER GENERATION ---
        const generateMeal = (isDinner = false) => {
            const mainProtein = getRandomItem(available.proteinsForLunchDinner, usedProteinsToday);
            if(mainProtein) usedProteinsToday.push(mainProtein);
            
            return {
                protein: { main: mainProtein, equivalents: getEquivalentOptions(available.proteinsForLunchDinner, mainProtein) },
                vegetables: { main: getRandomItem(available.saladCombos) || "Vegetales al vapor", equivalents: getEquivalentOptions(available.saladCombos) },
                carbohydrates: { main: getRandomItem(available.carbohydrates), equivalents: getEquivalentOptions(available.carbohydrates), portion: isDinner ? "porción más pequeña o evitar" : carbPortionText },
                fats: { main: getRandomItem(available.fats), equivalents: getEquivalentOptions(available.fats), portion: "porción pequeña" },
            };
        };
        dailyPlan.lunch = generateMeal();
        dailyPlan.dinner = generateMeal(true); // Pass true to indicate it's dinner

        const potentialSnacks = [];
        potentialSnacks.push("Agua (mucha, al menos medio litro)");
        potentialSnacks.push("Café o té sin azúcar");
        if (available.proteins.includes("Cuajada")) { potentialSnacks.push("Cuajada (máximo 200g)"); }
        if (available.fats.some(f => ["Frutos secos"].includes(f))) { potentialSnacks.push("Frutos secos (máximo 25g)"); }
        dailyPlan.snacks = potentialSnacks.sort(() => 0.5 - Math.random()).slice(0, 2);
        mealPlan.push(dailyPlan);
    }
    return mealPlan;
};


// --- ALL UI COMPONENTS ---
const AuthScreen = () => {
    const [authView, setAuthView] = useState('login');
    if (authView === 'login') {
        return <LoginScreen onGoToRegister={() => setAuthView('register')} />;
    }
    if (authView === 'register') {
        return <RegistrationFlow onCancel={() => setAuthView('login')} />;
    }
    return null;
}

const RegistrationFlow = ({ onCancel }) => {
    const [step, setStep] = useState('cedula');
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
        batch.update(cedulaRef, { isClaimed: true, claimedBy: user.uid, claimedAt: serverTimestamp() });
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
        if(!sede){
            setError("Por favor, selecciona tu sede antes de continuar.");
            return;
        }
        setIsLoading(true);
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;
            await completeRegistration(user, user.displayName);
        } catch (err) {
             setError(err.code === 'auth/account-exists-with-different-credential' ? 'Ya existe una cuenta con este correo electrónico.' : 'Error al registrar con Google.');
             await signOut(auth);
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
            setError("Credenciales incorrectas o usuario no registrado.");
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
            setError("Error al iniciar sesión con Google.");
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

const EditProfileModal = ({ isOpen, onClose, user, setUserDataInDashboard }) => {
    const [name, setName] = useState(user?.displayName || '');
    const [photo, setPhoto] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleFileChange = (e) => {
        if (e.target.files[0]) {
            setPhoto(e.target.files[0]);
        }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setSuccess('');

        try {
            const currentUser = auth.currentUser;
            if (!currentUser) throw new Error("No hay un usuario autenticado.");

            let photoURL = currentUser.photoURL;
            if (photo) {
                const storageRef = ref(storage, `profilePictures/${currentUser.uid}`);
                await uploadBytes(storageRef, photo);
                photoURL = await getDownloadURL(storageRef);
            }

            await updateProfile(currentUser, {
                displayName: name,
                photoURL: photoURL
            });

            const userDocRef = doc(db, "users", currentUser.uid);
            await setDoc(userDocRef, { name, photoURL }, { merge: true });

            setUserDataInDashboard(prev => ({ ...prev, name, photoURL }));
            
            setSuccess('¡Perfil actualizado con éxito!');
        } catch (err) {
            console.error("Error updating profile:", err);
            setError('Error al actualizar el perfil.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-md m-auto animate-fade-in-up" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-gray-800 mb-4">Editar Perfil</h3>
                <form onSubmit={handleUpdate} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Nombre</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Foto de Perfil</label>
                        <input type="file" onChange={handleFileChange} accept="image/*" className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                    </div>
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                    {success && <p className="text-green-500 text-sm">{success}</p>}
                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">Cerrar</button>
                        <button type="submit" disabled={isLoading} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
                            {isLoading ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const Sidebar = ({ user, userData, isOpen, onClose, onEditProfile }) => {
    if (!user) return null;
    const handleLogout = async () => { await signOut(auth); };
    return (
        <>
            <div className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onClose}></div>
            <div className={`fixed top-0 left-0 h-full w-72 bg-white shadow-2xl z-50 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="p-6">
                    <div className="flex items-center mb-6">
                        <img src={userData?.photoURL || user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'U'}&background=random`} alt="Perfil" className="w-16 h-16 rounded-full mr-4 object-cover" />
                        <div>
                            <p className="font-bold text-lg text-gray-800">{userData?.name || user.displayName}</p>
                            <p className="text-sm text-gray-600">{userData?.sede || 'Sede no asignada'}</p>
                        </div>
                    </div>
                    <nav className="space-y-2">
                        <button onClick={onEditProfile} className="w-full text-left p-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"><i className="fa-solid fa-pen-to-square mr-3"></i>Editar Perfil</button>
                        <button onClick={handleLogout} className="w-full text-left p-3 rounded-lg text-red-500 hover:bg-red-50 transition-colors"><i className="fa-solid fa-right-from-bracket mr-3"></i>Cerrar Sesión</button>
                    </nav>
                </div>
            </div>
        </>
    );
};

const Header = ({ userName, onMenuClick }) => (
    <header className="bg-white/80 backdrop-blur-sm shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
                <button onClick={onMenuClick} className="text-gray-600 hover:text-gray-800"><i className="fa-solid fa-bars text-2xl"></i></button>
                <h1 className="text-xl font-bold text-gray-800">Hola, {userName || 'Usuario'}</h1>
                <div></div>
            </div>
        </div>
    </header>
);

const Dashboard = ({ user, setView }) => {
    const [preferences, setPreferences] = useState(null);
    const [savedPlan, setSavedPlan] = useState(null);
    const [userData, setUserData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [editProfileOpen, setEditProfileOpen] = useState(false);
    const [showGenerator, setShowGenerator] = useState(false);
    const [planLimitData, setPlanLimitData] = useState({ count: 0, weekStartDate: null });

    useEffect(() => {
        const fetchInitialData = async () => {
            if (user) {
                const userDocRef = doc(db, "users", user.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) setUserData(userDocSnap.data());

                const planDocRef = doc(db, "mealPlans", user.uid);
                const planDocSnap = await getDoc(planDocRef);
                if (planDocSnap.exists()) setSavedPlan(planDocSnap.data().plan);
                
                const planMetaRef = doc(db, "planMetadata", user.uid);
                const planMetaSnap = await getDoc(planMetaRef);
                if (planMetaSnap.exists()) {
                    const data = planMetaSnap.data();
                    const weekAgo = new Date();
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    if (data.weekStartDate && data.weekStartDate.toDate() < weekAgo) {
                         setPlanLimitData({ count: 0, weekStartDate: Timestamp.now() });
                         await setDoc(planMetaRef, { count: 0, weekStartDate: serverTimestamp() }, { merge: true });
                    } else {
                        setPlanLimitData(data);
                    }
                } else {
                    await setDoc(planMetaRef, { count: 0, weekStartDate: serverTimestamp() });
                }
                setIsLoading(false);
            }
        };
        fetchInitialData();
    }, [user]);

    const handleGeneratePlan = (prefs) => {
        if((planLimitData.count || 0) >= 2) {
            return;
        }
        setPreferences(prefs);
    };

    const handleSavePlan = async (plan) => {
        if (user) {
            const batch = writeBatch(db);
            const planDocRef = doc(db, "mealPlans", user.uid);
            batch.set(planDocRef, { plan, createdAt: serverTimestamp() });
            
            const planMetaRef = doc(db, "planMetadata", user.uid);
            const newCount = (planLimitData.count || 0) + 1;
            const newStartDate = planLimitData.weekStartDate || serverTimestamp();
            batch.set(planMetaRef, { 
                count: newCount, 
                weekStartDate: newStartDate
            }, { merge: true });
            await batch.commit();

            setSavedPlan(plan);
            setPreferences(null);
            setShowGenerator(false);
            setPlanLimitData(prev => ({ ...prev, count: newCount, weekStartDate: newStartDate }));
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
            <Header userName={user.displayName} onMenuClick={() => setSidebarOpen(true)} />
            <Sidebar user={user} userData={userData} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} onEditProfile={() => setEditProfileOpen(true)} />
            <EditProfileModal isOpen={editProfileOpen} onClose={() => setEditProfileOpen(false)} user={user} setUserDataInDashboard={setUserData}/>
            <main className="flex-grow p-4 sm:p-8 flex flex-col">
                {!savedPlan && !showGenerator && !mealPlan && (
                    <div className="flex-grow flex flex-col justify-center items-center text-center">
                        <h2 className="text-2xl font-bold mb-4">¡Bienvenido, {user.displayName}!</h2>
                        <p className="mb-6">Parece que aún no tienes un plan de comidas.</p>
                        <button onClick={() => setShowGenerator(true)} className="px-8 py-4 bg-green-600 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-green-700">Crear mi primer plan</button>
                    </div>
                )}
                {(showGenerator && !mealPlan) && <PreferencesForm onSubmit={handleGeneratePlan} />}
                {savedPlan && !showGenerator && !mealPlan && (
                    <><MealPlanDisplay mealPlan={savedPlan} setView={setView} /><div className="text-center mt-6">{ (planLimitData.count || 0) < 2 ? (<button onClick={() => setShowGenerator(true)} className="px-8 py-4 bg-blue-600 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-blue-700">Generar Nuevo Plan ({2 - (planLimitData.count || 0)} restantes)</button>) : (<div className="p-4 bg-yellow-100 text-yellow-800 rounded-lg max-w-lg mx-auto"><h4 className="font-bold">¡Límite alcanzado!</h4><p className="text-sm">Has generado tus dos planes de la semana. El inicio es duro, ¡pero la constancia es la clave del éxito! Sigue así.</p></div>) }</div></>
                )}
                {mealPlan && (
                    <><MealPlanDisplay mealPlan={mealPlan} setView={setView} /><div className="text-center mt-6 space-x-4"><button onClick={() => { setPreferences(null); setShowGenerator(false); }} className="px-8 py-4 bg-gray-600 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-gray-700">Cancelar</button><button onClick={() => handleSavePlan(mealPlan)} className="px-8 py-4 bg-green-600 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-green-700">Guardar Plan</button></div></>
                )}
            </main>
        </div>
    );
};

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
                <div className="min-h-[150px] max-h-[60vh] overflow-y-auto pr-4 flex flex-col justify-start items-start">
                    {isLoading && (<div className="w-full text-center"><div className="w-12 h-12 rounded-full animate-spin border-4 border-dashed border-blue-500 border-t-transparent mx-auto"></div><p className="mt-4 text-gray-600">Pensando...</p></div>)}
                    {error && <div className="text-center text-red-600 bg-red-100 p-4 rounded-lg w-full"><i className="fa-solid fa-circle-exclamation mr-2"></i>{error}</div>}
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
    
    const handleToggleFood = (food) => {
        setExcludedFoods(prev => prev.includes(food) ? prev.filter(f => f !== food) : [...prev, food]);
    };
    
    const handleSubmit = (event) => {
        event.preventDefault();
        onSubmit({ isEctomorph, excludedFoods });
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
                <div className="text-center"><button type="submit" className="px-10 py-5 bg-blue-600 text-white font-bold text-xl rounded-xl shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300">Generar Plan</button></div>
            </form>
        </div>
    );
};

const MealPlanDisplay = ({ mealPlan, setView }) => {
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
                 <div className="text-center mt-12"><button onClick={() => setView('contact')} className="w-full max-w-md mx-auto px-8 py-4 bg-teal-500 text-white font-semibold rounded-xl shadow-lg hover:bg-teal-600 focus:outline-none focus:ring-4 focus:ring-teal-300">¿Tienes dudas?, haz clic aquí</button></div>
            </div>
        </>
    );
};

const ContactScreen = ({ onBack }) => {
    const contacts = [{ sede: 'Ciudadela', number: '+573041292664' }, { sede: 'Florida', number: '+573163287396' }, { sede: 'Piedecuesta', number: '+573102530414' }];
    const message = encodeURIComponent("Necesito más información de cómo iniciar mi cambio");

    return (
        <div className="p-6 sm:p-8 max-w-2xl w-full mx-auto bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-200/50 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-4" style={{ fontFamily: "'Inter', sans-serif" }}>Contacta una Sede</h2>
            <p className="text-gray-600 mb-8">Elige tu sede más cercana para recibir más información e iniciar tu cambio.</p>
            <div className="space-y-4 mb-8">
                {contacts.map(contact => (
                    <a key={contact.sede} href={`https://wa.me/${contact.number.replace('+', '')}?text=${message}`} target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-green-500 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-green-600 focus:outline-none focus:ring-4 focus:ring-green-300 transition-all duration-300 ease-in-out transform hover:scale-105"><i className="fa-brands fa-whatsapp text-xl"></i>{contact.sede}</a>
                ))}
            </div>
            <button onClick={onBack} className="px-8 py-4 bg-gray-600 text-white font-semibold rounded-xl shadow-lg hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-300 transition-all duration-300 ease-in-out transform hover:scale-105">← Volver</button>
        </div>
    )
};


// --- MAIN APP COMPONENT ---
function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentView, setCurrentView] = useState('auth');

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                const userDocRef = doc(db, "users", currentUser.uid);
                getDoc(userDocRef).then(userDocSnap => {
                    if (userDocSnap.exists()) {
                        setUser(currentUser);
                        setCurrentView('dashboard');
                    } else {
                        signOut(auth);
                    }
                });
            } else {
                setUser(null);
                setCurrentView('auth');
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const renderContent = () => {
        if (loading) {
            return <div className="flex justify-center items-center h-screen"><div className="w-16 h-16 rounded-full animate-spin border-4 border-dashed border-blue-500 border-t-transparent"></div></div>;
        }

        switch (currentView) {
            case 'dashboard':
                return user ? <Dashboard user={user} setView={setCurrentView} /> : <AuthScreen />;
            case 'contact':
                return <ContactScreen onBack={() => setCurrentView('dashboard')} />;
            case 'auth':
            default:
                return <AuthScreen />;
        }
    };
    
    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50">
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap'); @import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css'); body { font-family: 'Inter', sans-serif; } .toggle-checkbox:checked { right: 0; border-color: #3B82F6; } .toggle-checkbox:checked + .toggle-label { background-color: #3B82F6; } .animate-fade-in-up { animation: fade-in-up 0.3s ease-out forwards; } @keyframes fade-in-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            <div className="flex justify-center items-center min-h-screen w-full">
                {renderContent()}
            </div>
        </div>
    );
}

export default App;
