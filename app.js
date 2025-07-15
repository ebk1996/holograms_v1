import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'; // For camera control
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { v4 as uuidv4 } from 'uuid'; // For unique IDs

// Main App component
const App = () => {
    // Refs for the canvas and the scene elements
    const mountRef = useRef(null);
    const sceneRef = useRef(null);
    const cameraRef = useRef(null);
    const rendererRef = useRef(null);
    const controlsRef = useRef(null);
    const fontRef = useRef(null); // Ref to store the loaded font
    const raycasterRef = useRef(new THREE.Raycaster()); // Raycaster for interactive clicks
    const mouseRef = useRef(new THREE.Vector2()); // Mouse coordinates for raycasting

    // State to manage tasks
    const [tasks, setTasks] = useState([]);
    const [newTaskText, setNewTaskText] = useState('');
    const [suggestedPriority, setSuggestedPriority] = useState(null); // State for LLM suggested priority
    const [isSuggestingPriority, setIsSuggestingPriority] = useState(false); // Loading state for LLM call

    // Helper function to map priority text to numerical value
    const mapPriorityTextToNumber = (priorityText) => {
        switch (priorityText.toLowerCase().trim()) {
            case 'low': return 0;
            case 'medium': return 1;
            case 'high': return 2;
            default: return 1; // Default to Medium if LLM gives unexpected output
        }
    };

    // Function to load font for 3D text
    const loadFont = useCallback(() => {
        const loader = new FontLoader();
        loader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/fonts/helvetiker_regular.typeface.json', (font) => {
            fontRef.current = font;
            // After font is loaded, trigger a re-render to draw text if tasks exist
            setTasks(prevTasks => [...prevTasks]); // This will re-run the task useEffect
            console.log("Font loaded successfully.");
        }, undefined, (error) => {
            console.error("Error loading font:", error);
        });
    }, []);

    // Function to toggle task completion (used by both UI and 3D interaction)
    const toggleTaskCompletion = useCallback((id) => {
        setTasks(prevTasks =>
            prevTasks.map(task =>
                task.id === id ? { ...task, completed: !task.completed } : task
            )
        );
    }, []);

    // Function to delete a task (used by UI)
    const deleteTask = useCallback((id) => {
        setTasks(prevTasks => prevTasks.filter(task => task.id !== id));
    }, []);

    // Initialize 3D scene
    useEffect(() => {
        // Load font when component mounts
        loadFont();

        const currentMount = mountRef.current;
        if (!currentMount) return;

        // Scene setup
        const scene = new THREE.Scene();
        sceneRef.current = scene;
        scene.background = new THREE.Color(0x0a0a1a); // Dark background for holographic feel

        // Camera setup
        const camera = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
        camera.position.set(0, 5, 15); // Adjust camera position
        cameraRef.current = camera;

        // Renderer setup
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true; // Enable shadows
        currentMount.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // OrbitControls for camera interaction
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true; // Smooth camera movements
        controls.dampingFactor = 0.05;
        controls.screenSpacePanning = false;
        controls.minDistance = 5;
        controls.maxDistance = 50;
        controls.maxPolarAngle = Math.PI / 2; // Prevent camera from going below the ground
        controlsRef.current = controls;

        // Lights
        const ambientLight = new THREE.AmbientLight(0x404040, 2); // Soft white light
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 7.5);
        directionalLight.castShadow = true;
        scene.add(directionalLight);

        // Add a ground plane for reference
        const planeGeometry = new THREE.PlaneGeometry(50, 50);
        const planeMaterial = new THREE.MeshStandardMaterial({
            color: 0x00ffff, // Cyan for a holographic grid
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide
        });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = -Math.PI / 2;
        plane.receiveShadow = true;
        scene.add(plane);

        // --- Debugging Helpers ---
        // Add an AxesHelper to show X, Y, Z axes
        const axesHelper = new THREE.AxesHelper(10);
        scene.add(axesHelper);

        // Add a GridHelper to visualize the ground plane
        const gridHelper = new THREE.GridHelper(50, 50, 0x888888, 0x444444);
        scene.add(gridHelper);
        // --- End Debugging Helpers ---

        // Animation loop
        const animate = () => {
            requestAnimationFrame(animate);
            controls.update(); // Only required if controls.enableDamping is set to true
            renderer.render(scene, camera);
        };
        animate();

        // Handle window resize
        const handleResize = () => {
            if (currentMount) {
                camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
            }
        };
        window.addEventListener('resize', handleResize);

        // Handle 3D task click interaction (Raycasting)
        const onCanvasClick = (event) => {
            if (!currentMount || !cameraRef.current || !sceneRef.current) return;

            // Calculate mouse position in normalized device coordinates (-1 to +1)
            mouseRef.current.x = (event.clientX / currentMount.clientWidth) * 2 - 1;
            mouseRef.current.y = -(event.clientY / currentMount.clientHeight) * 2 + 1;

            // Update the raycaster with the camera and mouse position
            raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

            // Calculate objects intersecting the ray
            const intersects = raycasterRef.current.intersectObjects(sceneRef.current.children);

            for (let i = 0; i < intersects.length; i++) {
                // Check if the intersected object is a task mesh
                if (intersects[i].object.userData.isTask && intersects[i].object.userData.taskId) {
                    toggleTaskCompletion(intersects[i].object.userData.taskId);
                    break; // Only interact with the first intersected task
                }
            }
        };
        currentMount.addEventListener('click', onCanvasClick);


        // Cleanup on component unmount
        return () => {
            window.removeEventListener('resize', handleResize);
            if (currentMount) {
                currentMount.removeEventListener('click', onCanvasClick);
                if (renderer.domElement) {
                    currentMount.removeChild(renderer.domElement);
                }
            }
            // Dispose of Three.js objects to prevent memory leaks
            scene.traverse((object) => {
                if (object.isMesh) {
                    object.geometry.dispose();
                    object.material.dispose();
                }
            });
            renderer.dispose();
            controls.dispose();
            console.log("Three.js scene cleaned up.");
        };
    }, [loadFont, toggleTaskCompletion]); // Depend on loadFont and toggleTaskCompletion

    // Effect to update 3D tasks when `tasks` state changes or font is loaded
    useEffect(() => {
        const scene = sceneRef.current;
        const font = fontRef.current;

        if (!scene || !font) {
            console.log("Scene or font not ready for task rendering.");
            return;
        }

        // Remove existing task meshes from the scene
        const tasksToRemove = [];
        scene.children.forEach(child => {
            if (child.userData.isTask) {
                tasksToRemove.push(child);
            }
        });
        tasksToRemove.forEach(child => {
            scene.remove(child);
            child.geometry.dispose();
            child.material.dispose();
        });

        // Add new task meshes
        tasks.forEach((task, index) => {
            const material = new THREE.MeshStandardMaterial({
                color: task.completed ? 0x00ff00 : 0x00ffff, // Green if completed, cyan otherwise
                transparent: true,
                opacity: 0.7,
                emissive: task.completed ? 0x00ff00 : 0x00ffff,
                emissiveIntensity: 0.3,
            });

            const textGeometry = new TextGeometry(task.text, {
                font: font,
                size: 0.8,
                height: 0.2,
                curveSegments: 12,
                bevelEnabled: true,
                bevelThickness: 0.03,
                bevelSize: 0.02,
                bevelOffset: 0,
                bevelSegments: 5
            });
            textGeometry.center(); // Center the text geometry

            const mesh = new THREE.Mesh(textGeometry, material);
            mesh.position.set(
                (index % 3 - 1) * 5, // X position (3 tasks per row)
                Math.floor(index / 3) * -2 + 3, // Y position (rows go downwards)
                (index % 2) * -1 // Z position for slight depth variation
            );
            mesh.castShadow = true;
            mesh.userData.isTask = true; // Mark as a task object
            mesh.userData.taskId = task.id; // Store task ID for interaction
            scene.add(mesh);
        });
        console.log(`Rendered ${tasks.length} 3D tasks.`);
    }, [tasks]); // Re-run when tasks array changes

    // Function to add a new task
    const addTask = () => {
        if (newTaskText.trim() === '') return;
        const newTask = {
            id: uuidv4(),
            text: newTaskText.trim(),
            completed: false,
            priority: suggestedPriority !== null ? suggestedPriority : Math.floor(Math.random() * 3) // Use suggested priority or random
        };
        setTasks(prevTasks => [...prevTasks, newTask]);
        setNewTaskText('');
        setSuggestedPriority(null); // Reset suggested priority after adding task
    };

    // Function to suggest task priority using Gemini API
    const handleSuggestPriority = async () => {
        if (newTaskText.trim() === '') {
            console.warn("Task text is empty. Cannot suggest priority.");
            return;
        }

        setIsSuggestingPriority(true);
        setSuggestedPriority(null); // Clear previous suggestion

        try {
            const prompt = `Given the following task description, suggest its priority as either "Low", "Medium", or "High". Only return the word for the priority, nothing else. Task: "${newTaskText}"`;
            const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
            const apiKey = ""; // Canvas will provide this
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API error: ${response.status} ${response.statusText} - ${errorData.error.message}`);
            }

            const result = await response.json();
            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const llmResponseText = result.candidates[0].content.parts[0].text;
                const numericPriority = mapPriorityTextToNumber(llmResponseText);
                setSuggestedPriority(numericPriority);
                console.log("Suggested priority:", llmResponseText, "(Numeric:", numericPriority, ")");
            } else {
                console.warn("Gemini API response structure unexpected:", result);
                setSuggestedPriority(1); // Default to medium on unexpected response
            }
        } catch (error) {
            console.error("Error suggesting priority:", error);
            setSuggestedPriority(1); // Default to medium on error
        } finally {
            setIsSuggestingPriority(false);
        }
    };


    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white font-inter">
            {/* Custom scrollbar style for the task list */}
            <style>
                {`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #374151; /* bg-gray-700 */
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #06b6d4; /* text-cyan-500 */
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #0ea5e9; /* hover color */
                }
                `}
            </style>

            {/* Header */}
            <header className="p-4 bg-gray-800 shadow-lg flex justify-between items-center rounded-b-lg">
                <h1 className="text-3xl font-bold text-cyan-400">Holographic Task Manager</h1>
                <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-400">Drag to rotate, scroll to zoom, click 3D tasks to toggle completion</span>
                </div>
            </header>

            {/* Main content area */}
            <div className="flex flex-grow overflow-hidden">
                {/* 3D Canvas */}
                <div ref={mountRef} className="flex-grow bg-gradient-to-br from-gray-900 to-blue-900 relative rounded-lg m-4 shadow-inner">
                    {/* This div will contain the Three.js canvas */}
                </div>

                {/* Task Management UI */}
                <div className="w-1/3 p-6 bg-gray-800 m-4 rounded-lg shadow-xl flex flex-col">
                    <h2 className="text-2xl font-semibold mb-4 text-cyan-300">My Tasks</h2>

                    {/* Add New Task */}
                    <div className="mb-6 flex space-x-2">
                        <input
                            type="text"
                            className="flex-grow p-3 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            placeholder="Add a new holographic task..."
                            value={newTaskText}
                            onChange={(e) => setNewTaskText(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && addTask()}
                        />
                        <button
                            onClick={addTask}
                            className="px-5 py-3 bg-cyan-600 text-white rounded-lg shadow-md hover:bg-cyan-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        >
                            Add Task
                        </button>
                        <button
                            onClick={handleSuggestPriority}
                            className={`px-5 py-3 rounded-lg shadow-md transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500
                                ${isSuggestingPriority ? 'bg-gray-500 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}
                            `}
                            disabled={isSuggestingPriority || newTaskText.trim() === ''}
                        >
                            {isSuggestingPriority ? 'Suggesting...' : 'Suggest Priority ✨'}
                        </button>
                    </div>
                    {suggestedPriority !== null && (
                        <p className="text-sm text-gray-300 mb-4">
                            Suggested Priority: <span className={`font-bold
                                ${suggestedPriority === 0 ? 'text-blue-400' : suggestedPriority === 1 ? 'text-yellow-400' : 'text-red-400'}`}>
                                {suggestedPriority === 0 ? 'Low' : suggestedPriority === 1 ? 'Medium' : 'High'}
                            </span> (Click Add Task to use this)
                        </p>
                    )}


                    {/* Task List */}
                    <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
                        {tasks.length === 0 ? (
                            <p className="text-gray-400 text-center mt-8">No tasks yet! Add some above.</p>
                        ) : (
                            <ul className="space-y-3">
                                {tasks.map((task) => (
                                    <li
                                        key={task.id}
                                        className={`flex items-center justify-between p-4 rounded-lg shadow-md transition-all duration-200
                                            ${task.completed ? 'bg-green-800/50 border border-green-700' : 'bg-gray-700 border border-gray-600'}`}
                                    >
                                        <div className="flex items-center">
                                            <input
                                                type="checkbox"
                                                checked={task.completed}
                                                onChange={() => toggleTaskCompletion(task.id)}
                                                className="form-checkbox h-5 w-5 text-cyan-500 rounded border-gray-500 focus:ring-cyan-500 cursor-pointer"
                                            />
                                            <span
                                                className={`ml-3 text-lg ${task.completed ? 'line-through text-gray-400' : 'text-white'}`}
                                            >
                                                {task.text}
                                            </span>
                                            <span className={`ml-3 text-xs px-2 py-1 rounded-full
                                                ${task.priority === 0 ? 'bg-blue-600' : task.priority === 1 ? 'bg-yellow-600' : 'bg-red-600'}`}>
                                                {task.priority === 0 ? 'Low' : task.priority === 1 ? 'Medium' : 'High'}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => deleteTask(task.id)}
                                            className="ml-4 p-2 text-red-400 hover:text-red-500 transition-colors duration-200 rounded-full hover:bg-gray-600"
                                            title="Delete Task"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="p-3 bg-gray-800 text-center text-gray-500 text-sm rounded-t-lg">
                Holographic Task Manager | Powered by Three.js & React
            </footer>
        </div>
    );
};

export default App;
