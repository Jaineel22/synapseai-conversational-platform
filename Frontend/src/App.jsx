import './App.css';
import Sidebar from "./Sidebar.jsx";
import ChatWindow from "./ChatWindow.jsx";
import AuthScreen from "./AuthScreen.jsx";
import { MyContext } from "./MyContext.jsx";
import { ThemeContext } from "./ThemeContext.jsx";
import { useToast } from "./useToast.js";
import { useState, useEffect, useCallback } from 'react';
import { v1 as uuidv1 } from "uuid";
import axios from 'axios';

// ─── Axios Base URL ───────────────────────────────────────
// In development: Vite proxy handles /api → localhost:8080
// In production: VITE_API_URL points to your deployed backend URL
axios.defaults.baseURL = import.meta.env.VITE_API_URL || '';
axios.defaults.withCredentials = true;

// In a production build there is no dev proxy, so an empty VITE_API_URL
// means every request silently targets a relative /api/... path on this
// frontend's own origin — which has no backend behind it. This has
// happened for real (VITE_API_URL left pointing at a decommissioned
// backend after a migration) and surfaced only as a generic "couldn't
// load" toast with nothing in the console to explain why. This warning
// exists so that failure mode is visible immediately in devtools instead
// of requiring a network-tab investigation.
if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
    console.warn(
        '[SynapseAI] VITE_API_URL is not set in this production build. ' +
        'API requests will go to relative /api paths on this frontend\'s own origin, ' +
        'which has no backend — set VITE_API_URL in your hosting platform\'s ' +
        'environment variables to the deployed backend URL and redeploy.'
    );
}

// Surfaces the specific failure when a request never got a response at
// all (wrong/unreachable API host, CORS rejection, DNS failure, etc.) —
// distinct from a normal HTTP error response, and otherwise invisible
// beyond a generic "Network Error" with no indication of which URL was
// actually being called.
axios.interceptors.response.use(
    (response) => response,
    (error) => {
        if (!error.response) {
            const attemptedUrl = `${error.config?.baseURL || '(relative)'}${error.config?.url || ''}`;
            console.error(
                `[SynapseAI] Network request failed with no response — attempted URL: ${attemptedUrl}. ` +
                'This usually means the backend is unreachable at that address, or the request was blocked by CORS. ' +
                'Check VITE_API_URL and the backend\'s CLIENT_ORIGIN/CORS configuration.',
                error.message
            );
        }
        return Promise.reject(error);
    }
);

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
    const [authMode, setAuthMode] = useState('login');
    const [authPending, setAuthPending] = useState(false);
    const [loading, setLoading] = useState(true);

    // Theme state
    const [theme, setTheme] = useState('dark');

    // Sidebar visibility — only meaningful below the mobile/tablet
    // breakpoint, where the sidebar becomes an off-canvas drawer instead
    // of a permanently-visible column.
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const { showToast } = useToast();

    const fetchUserThreads = useCallback(async () => {
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
    }, []);

    const updateUserTheme = useCallback(async (newTheme) => {
        if (!user) return;
        try {
            await axios.put('/api/auth/theme', { theme: newTheme });
        } catch (error) {
            console.error('Failed to update theme:', error);
        }
    }, [user]);

    // Session restoration: the auth token lives in an httpOnly cookie, which
    // JavaScript cannot read directly. The browser sends it automatically on
    // this request, so asking the backend to verify it is the only reliable
    // way to know whether a session exists.
    const checkAuth = async () => {
        try {
            const response = await axios.get('/api/auth/me');
            setUser(response.data.user);
            setTheme(response.data.user.theme || 'dark');
        } catch {
            // No valid session cookie — this is the normal logged-out state,
            // not an unexpected failure, so it isn't logged as an error.
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkAuth();
    }, []);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        document.body.setAttribute('data-theme', theme);
        if (user) {
            updateUserTheme(theme);
        }
    }, [theme, user, updateUserTheme]);

    const handleAuth = async (userData) => {
        setAuthPending(true);
        try {
            const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
            const response = await axios.post(endpoint, userData);
            setUser(response.data.user);
            setTheme(response.data.user.theme || 'dark');
            fetchUserThreads();
        } catch (error) {
            const message = error.response?.data?.error || 'Authentication failed';
            showToast(message, { type: 'error' });
            throw new Error(message); // lets AuthScreen clear its own pending state
        } finally {
            setAuthPending(false);
        }
    };

    const handleLogout = async () => {
        try {
            await axios.post('/api/auth/logout');
        } catch (error) {
            console.error('Logout error:', error);
        }
        // The session cookie is cleared server-side either way; always reset
        // local state so the UI reflects a logged-out session.
        setUser(null);
        setAllThreads([]);
        setPrevChats([]);
        setCurrThreadId(uuidv1());
        setNewChat(true);
        setPrompt("");
        setReply(null);
    };

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    const providerValues = {
        prompt, setPrompt,
        reply, setReply,
        currThreadId, setCurrThreadId,
        newChat, setNewChat,
        prevChats, setPrevChats,
        allThreads, setAllThreads,
        user, setUser,
        authMode, setAuthMode,
        handleAuth,
        handleLogout,
        theme, toggleTheme,
        fetchUserThreads,
        isSidebarOpen, setIsSidebarOpen,
    };

    if (loading) {
        return (
            <div className="loading-screen" role="status" aria-live="polite">
                <div className="loading-mark" aria-hidden="true">
                    <i className="fa-solid fa-brain"></i>
                </div>
            </div>
        );
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
                        <AuthScreen mode={authMode} onModeChange={setAuthMode} onSubmit={handleAuth} pending={authPending} />
                    )}
                </div>
            </MyContext.Provider>
        </ThemeContext.Provider>
    );
}

export default App;
