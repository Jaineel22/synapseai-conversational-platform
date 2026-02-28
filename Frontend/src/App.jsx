import './App.css';
import Sidebar from "./Sidebar.jsx";
import ChatWindow from "./ChatWindow.jsx";
import AuthModal from "./AuthModal.jsx";
import { MyContext } from "./MyContext.jsx";
import { ThemeContext } from "./ThemeContext.jsx";
import { useState, useEffect } from 'react';
import { v1 as uuidv1 } from "uuid";
import axios from 'axios';
import Cookies from 'js-cookie';

// ─── Axios Base URL ───────────────────────────────────────
// In development: Vite proxy handles /api → localhost:8080
// In production: VITE_API_URL points to your Render backend URL
axios.defaults.baseURL = import.meta.env.VITE_API_URL || '';
axios.defaults.withCredentials = true;

function App() {
    // Chat state
    const [prompt, setPrompt] = useState("");
    const [reply, setReply] = useState(null);
    const [currThreadId, setCurrThreadId] = useState(uuidv1());
    const [prevChats, setPrevChats] = useState([]);
    const [newChat, setNewChat] = useState(true);
    const [allThreads, setAllThreads] = useState([]);

    // Auth state
    const [user, setUser] = useState(null);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [authMode, setAuthMode] = useState('login');
    const [loading, setLoading] = useState(true);

    // Theme state
    const [theme, setTheme] = useState('dark');

    useEffect(() => {
        checkAuth();
    }, []);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        document.body.setAttribute('data-theme', theme);
        if (user) {
            updateUserTheme(theme);
        }
    }, [theme, user]);

    const checkAuth = async () => {
        try {
            const token = Cookies.get('token');
            if (!token) {
                setLoading(false);
                return;
            }
            const response = await axios.get('/api/auth/me');
            setUser(response.data.user);
            setTheme(response.data.user.theme || 'dark');
        } catch (error) {
            console.error('Auth check failed:', error);
            Cookies.remove('token');
        } finally {
            setLoading(false);
        }
    };

    const handleAuth = async (userData) => {
        try {
            const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
            const response = await axios.post(endpoint, userData);
            setUser(response.data.user);
            setTheme(response.data.user.theme || 'dark');
            setIsAuthModalOpen(false);
            fetchUserThreads();
        } catch (error) {
            console.error('Auth error:', error);
            alert(error.response?.data?.error || 'Authentication failed');
        }
    };

    const handleLogout = async () => {
        try {
            await axios.post('/api/auth/logout');
            setUser(null);
            Cookies.remove('token');
            setAllThreads([]);
            setPrevChats([]);
            setCurrThreadId(uuidv1());
            setNewChat(true);
            setPrompt("");
            setReply(null);
            delete axios.defaults.headers.common['Authorization'];
        } catch (error) {
            console.error('Logout error:', error);
            setUser(null);
            Cookies.remove('token');
            setAllThreads([]);
            setPrevChats([]);
            setCurrThreadId(uuidv1());
            setNewChat(true);
        }
    };

    const updateUserTheme = async (newTheme) => {
        if (!user) return;
        try {
            await axios.put('/api/auth/theme', { theme: newTheme });
        } catch (error) {
            console.error('Failed to update theme:', error);
        }
    };

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    const fetchUserThreads = async () => {
        try {
            const response = await axios.get('/api/thread');
            const filteredData = response.data.map(thread => ({
                threadId: thread.threadId,
                title: thread.title
            }));
            setAllThreads(filteredData);
        } catch (error) {
            console.error('Failed to fetch threads:', error);
        }
    };

    const providerValues = {
        prompt, setPrompt,
        reply, setReply,
        currThreadId, setCurrThreadId,
        newChat, setNewChat,
        prevChats, setPrevChats,
        allThreads, setAllThreads,
        user, setUser,
        isAuthModalOpen, setIsAuthModalOpen,
        authMode, setAuthMode,
        handleAuth,
        handleLogout,
        theme, toggleTheme,
        fetchUserThreads
    };

    if (loading) {
        return <div className="loading-screen">Loading...</div>;
    }

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            <MyContext.Provider value={providerValues}>
                <div className={`app ${theme}`} data-theme={theme}>
                    {user ? (
                        <>
                            <Sidebar />
                            <ChatWindow />
                        </>
                    ) : (
                        <div className="landing-page">
                            <h1>Welcome to SynapseAI</h1>
                            <p>Please login or register to continue</p>
                            <div className="auth-buttons">
                                <button onClick={() => { setAuthMode('login'); setIsAuthModalOpen(true); }}>
                                    Login
                                </button>
                                <button onClick={() => { setAuthMode('register'); setIsAuthModalOpen(true); }}>
                                    Register
                                </button>
                            </div>
                        </div>
                    )}
                    {isAuthModalOpen && (
                        <AuthModal
                            mode={authMode}
                            onClose={() => setIsAuthModalOpen(false)}
                            onSubmit={handleAuth}
                        />
                    )}
                </div>
            </MyContext.Provider>
        </ThemeContext.Provider>
    );
}

export default App;
