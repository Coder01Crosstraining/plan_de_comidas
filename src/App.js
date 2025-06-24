import React, { useState, useMemo, useEffect } from 'react';

// --- DATA STRUCTURE ---
const foodData = {
  proteins: { title: "Proteínas", iconClass: "fa-solid fa-drumstick-bite", items: ["Pechuga de pollo", "Huevo con yema", "Perniles de pollo", "Carne de res baja en grasa", "Hígado", "Mojarra", "Atún", "Merluza", "Trucha", "Salmón", "Camarones", "Pavo", "Codorniz", "Bagre", "Mero", "Tilapia", "Robalo", "Cachama", "Cerdo magro", "Mariscos", "Dorada", "Yogur griego (sin fruta, sin azúcar)", "Quesos bajos en grasa", "Cuajada", "Quinua"] },
  vegetables: { title: "Verduras y Vegetales", iconClass: "fa-solid fa-leaf", items: ["Pepino", "Tomate", "Acelgas", "Lechuga", "Repollo", "Pimentón", "Espinaca", "Brócoli", "Coliflor", "Apio en rama", "Berenjena", "Calabacín", "Champiñones", "Rábano", "Escarragos", "Habichuela", "Perejil", "Cilantro", "Zanahoria", "Cebolla", "Aguacate", "Espárragos", "Yota"] },
  carbohydrates: { title: "Carbohidratos", iconClass: "fa-solid fa-wheat-awn", items: ["Arroz", "Papa", "Mazorca-maíz", "Plátano", "Yuca", "Arepas", "Pasta", "Pan integral o blanco", "Cereales", "Frijoles", "Lentejas", "Avena", "Tortillas", "Tostadas integrales o blancas", "Garbanzos", "Arvejas", "Arracachas"] },
  fats: { title: "Grasas Saludables", iconClass: "fa-solid fa-droplet", items: ["Aguacate", "Aceite de oliva", "Mantequilla de leche de vaca", "Nueces", "Almendras", "Macadamias", "Aceite de coco", "Semillas de girasol", "Pistachos"] },
};

const otherFoods = {
  cheatMealFoods: ["Helados", "Pasteles", "Galletas", "Papas fritas", "Hamburguesas", "Gaseosas", "Dulces"],
  snackFruits: ["Manzana verde", "Fresas", "Pera criolla", "Patilla", "Sandía", "Melón", "Moras", "Frambuesas", "Durazno", "Manzana roja", "Piña", "Papaya", "Mango", "Banano", "Uva", "Naranja", "Mandarina"],
  beverages: ["Agua", "Agua con limón", "Tinto sin azúcar", "Aromáticas sin dulce", "Tés de infusión"],
};


// --- HELPER FUNCTIONS ---
const callGeminiAPI = async (prompt) => {
    try {
        const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { contents: chatHistory };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`API Error: Status ${response.status}`, errorBody);
            return `Error: ${response.status}. No se pudo conectar con el servicio de IA.`;
        }
        const result = await response.json();
        if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
            return result.candidates[0].content.parts[0].text;
        } else {
            console.error("Unexpected response structure:", result);
            return "No se pudo obtener una respuesta con el formato esperado. Inténtalo de nuevo.";
        }
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return "Hubo un error de red al generar la respuesta. Por favor, revisa tu conexión.";
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
        snackFruits: filterFoodList(otherFoods.snackFruits),
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
        if (available.snackFruits.length > 0) { potentialSnacks.push(`Opciones de fruta: ${getEquivalentOptions(available.snackFruits, null, [], 3).join(', ')}`); }
        if (available.proteins.includes("Cuajada")) { potentialSnacks.push("Cuajada (máximo 200g)"); }
        if (available.fats.some(f => ["Almendras", "Nueces", "Macadamias"].includes(f))) { potentialSnacks.push("Frutos secos (máximo 25g)"); }
        const shuffledSnacks = potentialSnacks.sort(() => 0.5 - Math.random());
        dailyPlan.snacks = shuffledSnacks.slice(0, 2);
        mealPlan.push(dailyPlan);
    }
    return mealPlan;
};

// --- UI COMPONENTS ---
const FormattedAIResponse = ({ content }) => {
    const formattedContent = useMemo(() => {
        if (!content || typeof content !== 'string') return null;
        
        const lines = content.split('\n').filter(line => line.trim() !== '');
        
        return lines.map((line, index) => {
            if (line.match(/^(Ingredientes|Pasos|Instrucciones|Sugerencia):/i) || line.trim().endsWith(':')) {
                return <h4 key={index} className="text-md font-bold text-gray-800 mt-3 mb-2">{line}</h4>;
            }
            if (line.match(/^[-*]|\d+\./)) {
                return <li key={index} className="ml-5">{line.replace(/^[-*]|\d+\./, '').trim()}</li>;
            }
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
                <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold text-gray-800">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-800 transition-colors">
                        <i className="fa-solid fa-xmark text-2xl"></i>
                    </button>
                </div>
                <div className="border-t border-gray-200 my-4"></div>
                <div className="min-h-[150px] flex flex-col justify-center items-center">
                    {isLoading && (
                         <div className="text-center">
                            <div className="w-12 h-12 rounded-full animate-spin border-4 border-dashed border-blue-500 border-t-transparent mx-auto"></div>
                            <p className="mt-4 text-gray-600">Pensando...</p>
                        </div>
                    )}
                    {error && <div className="text-center text-red-600 bg-red-100 p-4 rounded-lg"><i className="fa-solid fa-circle-exclamation mr-2"></i>{error}</div>}
                    {!isLoading && !error && content && <FormattedAIResponse content={content} />}
                </div>
            </div>
        </div>
    );
};

const IntroScreen = ({ onStart }) => (
    <div className="text-center p-6 sm:p-8 max-w-3xl mx-auto bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-200/50 transition-all duration-500 hover:shadow-blue-200/50">
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-800 mb-4" style={{ fontFamily: "'Inter', sans-serif" }}>Método PVC 2.0</h1>
        <p className="text-lg sm:text-xl text-gray-600 mb-8">Tu guía simple y efectiva para una alimentación balanceada.</p>
        <div className="grid md:grid-cols-3 gap-4 sm:gap-6 text-center mb-10">
            <div className="p-4 bg-green-100/70 rounded-xl border border-green-200"><i className="fa-solid fa-leaf text-3xl mx-auto text-green-600 mb-2"></i><h3 className="font-semibold text-green-800">1/2 Verduras</h3><p className="text-sm text-green-700">Consumo abundante</p></div>
            <div className="p-4 bg-blue-100/70 rounded-xl border border-blue-200"><i className="fa-solid fa-drumstick-bite text-3xl mx-auto text-blue-600 mb-2"></i><h3 className="font-semibold text-blue-800">1/4 Proteína</h3><p className="text-sm text-blue-700">150-200gr</p></div>
            <div className="p-4 bg-yellow-100/70 rounded-xl border border-yellow-200"><i className="fa-solid fa-wheat-awn text-3xl mx-auto text-yellow-600 mb-2"></i><h3 className="font-semibold text-yellow-800">1/4 Carbs</h3><p className="text-sm text-yellow-700">Porción controlada</p></div>
        </div>
        <button onClick={onStart} className="px-8 py-4 bg-blue-600 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-all duration-300 ease-in-out transform hover:scale-105">Crear Mi Plan Personalizado</button>
    </div>
);

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
        <div className="p-6 sm:p-8 max-w-5xl mx-auto bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-200/50">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-8 text-center" style={{ fontFamily: "'Inter', sans-serif" }}>Personaliza tu Plan</h2>
            <form onSubmit={handleSubmit}>
                <div className="mb-8 p-5 bg-blue-50 rounded-xl border border-blue-200 shadow-sm">
                    <label className="flex flex-col sm:flex-row items-start sm:items-center justify-between cursor-pointer gap-4">
                        <div><span className="text-blue-800 text-lg font-medium">¿Eres una persona ectomorfa (muy delgada)?</span><p className="text-sm text-blue-700 mt-1">Si lo seleccionas, tu plan priorizará el aumento de masa muscular con más carbohidratos.</p></div>
                        <div className="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in flex-shrink-0"><input type="checkbox" checked={isEctomorph} onChange={e => setIsEctomorph(e.target.checked)} className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"/><label className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label></div>
                    </label>
                </div>
                <div className="mb-6">
                    <h3 className="text-xl font-semibold text-gray-700 mb-4">¿Qué alimentos quieres excluir?</h3>
                    <p className="text-sm text-gray-500 mb-5">Selecciona los alimentos que no te gustan o no puedes comer. Aparecerán en rojo.</p>
                    {Object.entries(foodData).map(([key, { title, iconClass, items }]) => (
                        <div key={key} className="mb-6 bg-gray-50/70 p-5 rounded-xl border border-gray-200/80">
                            <h4 className="flex items-center text-lg font-semibold text-gray-700 mb-4"><i className={`${iconClass} w-6 h-6 mr-3 text-gray-500`}></i>{title}</h4>
                            <div className="flex flex-wrap gap-2">{items.map(food => (<FoodTag key={food} item={food} isSelected={excludedFoods.includes(food)} onToggle={handleToggleFood} />))}</div>
                        </div>
                    ))}
                </div>
                <div className="mb-8 bg-gray-50/70 p-5 rounded-xl border border-gray-200/80">
                    <label htmlFor="customRestrictions" className="block text-lg font-semibold text-gray-700 mb-2">Otras Restricciones / Alergias</label>
                    <p className="text-sm text-gray-500 mb-4">Escribe otros alimentos que debamos evitar, separados por comas (ej. gluten, lactosa, maní). El sistema intentará corregir errores de escritura.</p>
                    <textarea id="customRestrictions" value={customRestrictions} onChange={e => setCustomRestrictions(e.target.value)} rows="3" className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base" placeholder="Ej: arros, papas, mariscos..."></textarea>
                </div>
                <div className="text-center"><button type="submit" className="px-10 py-5 bg-green-600 text-white font-bold text-xl rounded-xl shadow-lg hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-300 transition-all duration-300 ease-in-out transform hover:scale-105">Generar Mi Plan de 7 Días</button></div>
            </form>
        </div>
    );
};

const MealPlanDisplay = ({ mealPlan, onBack, onContact }) => {
    const [modalState, setModalState] = useState({ isOpen: false, title: '', content: null, isLoading: false, error: null });

    const handleAIGeneration = async (type, data) => {
        let title = '';
        let prompt = '';

        switch (type) {
            case 'recipe':
                title = `Receta para ${data}`;
                prompt = `Eres un chef experto en comida saludable. Crea una receta sencilla y rápida (máximo 5 pasos) para preparar "${data}". La receta debe ser fácil de seguir y usar ingredientes comunes. Responde solo con la receta, sin introducciones, usando encabezados como "Ingredientes:" y "Pasos:".`;
                break;
            case 'snack':
                title = 'Sugerencia de Snack';
                prompt = `Eres un nutricionista creativo. Sugiere una opción de snack saludable y fácil de preparar para controlar la ansiedad entre comidas. Dame solo una sugerencia. Sé breve y directo.`;
                break;
            case 'cheat':
                 title = 'Sugerencia para Día Trampa';
                 prompt = `Eres un foodie experto en encontrar los mejores antojos. Sugiere una idea deliciosa y específica para una comida trampa (cheat meal). Sé creativo y describe el plato en una frase corta y apetitosa, evitando opciones de grandes cadenas de comida rápida.`;
                 break;
            default:
                return;
        }
        
        setModalState({ isOpen: true, title, content: null, isLoading: true, error: null });
        const response = await callGeminiAPI(prompt);
        
        if(response.startsWith("Error:")) {
            setModalState(prev => ({ ...prev, isLoading: false, error: response }));
        } else {
            setModalState(prev => ({ ...prev, isLoading: false, content: response }));
        }
    };
    
    const closeModal = () => setModalState({ isOpen: false, title: '', content: null, isLoading: false, error: null });

    const MealItem = ({ iconClass, color, title, meal, portion }) => (
        <div className="flex items-start space-x-3">
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${color.bg}`}><i className={`${iconClass} text-lg ${color.text}`}></i></div>
            <div>
                <p className={`font-bold text-base ${color.text}`}>{title} <span className="text-sm font-normal text-gray-500">({portion})</span></p>
                <p className="text-gray-800 text-base leading-tight">{meal.main || 'No disponible'}</p>
                {meal.equivalents?.length > 0 && <p className="text-sm text-gray-500 italic mt-1">Opciones: {meal.equivalents.join(', ')}</p>}
                {title === 'Proteína' && meal.main && (
                     <button onClick={() => handleAIGeneration('recipe', meal.main)} className="px-3 py-1 mt-2 text-xs font-semibold text-blue-700 bg-blue-100 rounded-full hover:bg-blue-200 transition-colors">Generar Receta</button>
                )}
            </div>
        </div>
    );

    return (
        <>
            <AIModal isOpen={modalState.isOpen} onClose={closeModal} title={modalState.title} isLoading={modalState.isLoading} content={modalState.content} error={modalState.error} />
            <div className="p-4 sm:p-8 w-full">
                <div className="text-center mb-10"><h2 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-2" style={{ fontFamily: "'Inter', sans-serif" }}>Tu Plan Semanal</h2><p className="text-gray-600">Este es un plan sugerido. ¡Escucha a tu cuerpo y ajústalo según necesites!</p></div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {mealPlan.map((day) => (
                        <div key={day.day} className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/50 p-6 flex flex-col transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                            <h3 className="text-2xl font-bold text-blue-700 text-center mb-4">{day.day}</h3>
                            {day.notes.length > 0 && (
                                <div className="p-4 bg-purple-100 rounded-lg text-center border border-purple-200 mb-4">
                                    <p className="font-semibold text-purple-800 mb-2">{day.notes[0]}</p>
                                    <button onClick={() => handleAIGeneration('cheat')} className="px-3 py-1 text-xs font-semibold text-purple-700 bg-purple-200 rounded-full hover:bg-purple-300 transition-colors">Sugerir idea</button>
                                </div>
                            )}
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
                             {day.snacks.length > 0 && (
                                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200 mt-6">
                                    <h4 className="font-bold text-base text-yellow-800 mb-2">Entrecomidas / Ansiedad</h4>
                                    <ul className="list-disc list-inside text-sm text-yellow-900/80 space-y-1">{day.snacks.map((snack, i) => <li key={i}>{snack}</li>)}</ul>
                                    <div className="text-center mt-3"><button onClick={() => handleAIGeneration('snack')} className="px-3 py-1 text-xs font-semibold text-yellow-800 bg-yellow-200 rounded-full hover:bg-yellow-300 transition-colors">Sugerir Snack con IA</button></div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                <div className="text-center mt-12 max-w-md mx-auto space-y-4">
                    <button onClick={onContact} className="w-full px-8 py-4 bg-green-500 text-white font-semibold rounded-xl shadow-lg hover:bg-green-600 focus:outline-none focus:ring-4 focus:ring-green-300 transition-all duration-300 ease-in-out transform hover:scale-105">¿Tienes dudas?, haz clic aquí</button>
                    <button onClick={onBack} className="w-full px-8 py-4 bg-gray-600 text-white font-semibold rounded-xl shadow-lg hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-300 transition-all duration-300 ease-in-out transform hover:scale-105">← Volver y Personalizar de Nuevo</button>
                </div>
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

const Footer = () => ( <footer className="w-full text-center p-4 mt-auto"><p className="text-sm text-gray-500">&copy; 2025 Crosstraining. Todos los derechos reservados.</p></footer>);

// --- Main App Component ---
function App() {
    const [screen, setScreen] = useState({current: 'intro', previous: 'intro'});
    const [preferences, setPreferences] = useState(null);
    const mealPlan = useMemo(() => { if (preferences) return generateMealPlan(preferences); return null; }, [preferences]);
    const navigate = (newScreen) => { setScreen(prev => ({ current: newScreen, previous: prev.current })); }
    const goBack = () => { setScreen(prev => ({ current: prev.previous, previous: prev.current })); }
    const renderScreen = () => {
        switch (screen.current) {
            case 'form': return <PreferencesForm onSubmit={(prefs) => { setPreferences(prefs); navigate('plan'); }} />;
            case 'plan': return mealPlan && <MealPlanDisplay mealPlan={mealPlan} onBack={() => navigate('form')} onContact={() => navigate('contact')} />;
            case 'contact': return <ContactScreen onBack={goBack} />;
            case 'intro': default: return <IntroScreen onStart={() => navigate('form')} />;
        }
    };
    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 flex flex-col">
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap'); @import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css'); body { font-family: 'Inter', sans-serif; } .toggle-checkbox:checked { right: 0; border-color: #3B82F6; } .toggle-checkbox:checked + .toggle-label { background-color: #3B82F6; } .animate-fade-in-up { animation: fade-in-up 0.3s ease-out forwards; } @keyframes fade-in-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            <main className="flex-grow flex flex-col justify-center items-center py-10 px-4 sm:px-6 lg:px-8 relative">{renderScreen()}</main>
            <Footer />
        </div>
    );
}
export default App;
