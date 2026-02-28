import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

// Cookie config — works for both local dev and production cross-origin
const cookieOptions = {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    secure: process.env.NODE_ENV === 'production',  // HTTPS only in production
};

// ─────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────
router.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: "User already exists with this email" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = new User({ name, email, password: hashedPassword });
        await user.save();

        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.cookie("token", token, cookieOptions);

        res.status(201).json({
            message: "User created successfully",
            user: { id: user._id, name: user.name, email: user.email, theme: user.theme },
            token,
        });
    } catch (error) {
        if (error.name === "MongoServerError" && error.code === 11000) {
            return res.status(400).json({ error: "Email already exists" });
        }
        res.status(500).json({ error: "Failed to register user", details: error.message });
    }
});

// ─────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.cookie("token", token, cookieOptions);

        res.json({
            message: "Login successful",
            user: { id: user._id, name: user.name, email: user.email, theme: user.theme },
            token,
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to login" });
    }
});

// ─────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────
router.post("/logout", (req, res) => {
    res.clearCookie("token", cookieOptions);
    res.json({ message: "Logged out successfully" });
});

// ─────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────
router.get("/me", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("-password");
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json({ user: { id: user._id, name: user.name, email: user.email, theme: user.theme } });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch user" });
    }
});

// ─────────────────────────────────────────
// PUT /api/auth/theme
// ─────────────────────────────────────────
router.put("/theme", authMiddleware, async (req, res) => {
    try {
        const { theme } = req.body;

        if (!["light", "dark"].includes(theme)) {
            return res.status(400).json({ error: "Invalid theme value" });
        }

        await User.findByIdAndUpdate(req.userId, { theme });
        res.json({ message: "Theme updated successfully", theme });
    } catch (error) {
        res.status(500).json({ error: "Failed to update theme" });
    }
});

export default router;
