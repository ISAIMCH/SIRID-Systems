const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const router = express.Router();

const verificationSender = process.env.EMAIL_USER || 'project.gymgo@gmail.com';
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: verificationSender,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

async function sendVerificationEmail({ recipient, name, verificationUrl }) {
    await transporter.sendMail({
        from: `Project-GymGo <${verificationSender}>`,
        to: recipient,
        replyTo: process.env.EMAIL_REPLY_TO || verificationSender,
        subject: 'Activa tu cuenta | Project-GymGo',
        html: `<h2>Hola ${name},</h2>
               <p>Por favor verifica tu correo haciendo clic en el siguiente enlace:</p>
               <a href="${verificationUrl}">Activar mi cuenta</a>`
    });
}

// Cliente de Google
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const COMMON_PASSWORDS = new Set([
    '12345678', '123456789', 'password', 'contraseña', 'qwerty123',
    'qwertyui', 'abc12345', 'admin123', 'letmein123', 'welcome1',
    'iloveyou', '00000000', '11111111', 'gymgo123'
]);

const normalizeText = (value = '') => value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const isValidBirthDate = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    return year >= 1900 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date.getTime() <= todayUtc;
};

// ==========================================
// 1. REGISTRO (CON DOBLE OPT-IN)
// ==========================================
router.post('/register', async (req, res) => {
    let createdUser;
    try {
        const { nombre, apellidos, fechaNacimiento, email, password } = req.body;

        if (typeof email !== 'string' || email.trim().length > 254 || !EMAIL_PATTERN.test(email.trim())) {
            return res.status(400).json({ msg: 'El correo electrónico no tiene un formato válido' });
        }
        if (!isValidBirthDate(fechaNacimiento)) {
            return res.status(400).json({ msg: 'La fecha de nacimiento no es válida' });
        }
        if (typeof password !== 'string' || password.length < 8 || password.length > 64) {
            return res.status(400).json({ msg: 'La contraseña debe tener entre 8 y 64 caracteres' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const normalizedPassword = normalizeText(password);
        const emailName = normalizeText(normalizedEmail).split('@')[0];
        const personalData = [nombre, apellidos, normalizedEmail, emailName].map(normalizeText).filter(Boolean);
        const isPersonalPassword = personalData.some((value) => value === normalizedPassword && value.length > 3);

        if (COMMON_PASSWORDS.has(normalizedPassword)) {
            return res.status(400).json({ msg: 'La contraseña es común o comprometida' });
        }
        if (isPersonalPassword) {
            return res.status(400).json({ msg: 'La contraseña no puede coincidir con tus datos personales' });
        }

        let user = await User.findOne({ email: normalizedEmail });
        if (user) {
            return res.status(400).json({ msg: 'El correo ya está registrado' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const tokenVerificacion = crypto.randomBytes(32).toString('hex');

        createdUser = new User({
            nombre,
            apellidos,
            fechaNacimiento,
            email: normalizedEmail,
            password: hashedPassword,
            verificado: false, 
            tokenVerificacion
        });

        await createdUser.save();

        const urlVerificacion = `${process.env.API_PUBLIC_URL || 'https://sirid-systems.onrender.com'}/api/auth/verificar/${tokenVerificacion}`;
        
        await sendVerificationEmail({
            recipient: normalizedEmail,
            name: nombre,
            verificationUrl: urlVerificacion
        });

        res.status(201).json({ msg: 'Usuario registrado. Revisa tu correo para verificar la cuenta.' });
    } catch (err) {
        if (createdUser?._id) {
            await User.deleteOne({ _id: createdUser._id }).catch((cleanupError) => {
                console.error('No se pudo limpiar el registro incompleto:', cleanupError.message);
            });
        }
        console.error('Error en registro:', err.message);
        res.status(503).json({ msg: 'No se pudo enviar el correo de verificación. Inténtalo de nuevo más tarde.' });
    }
});

// ==========================================
// 2. VERIFICACIÓN DE CORREO
// ==========================================
router.get('/verificar/:token', async (req, res) => {
    try {
        const user = await User.findOne({ tokenVerificacion: req.params.token });
        if (!user) {
            return res.status(400).send('Enlace inválido o expirado.');
        }

        user.verificado = true;
        user.tokenVerificacion = undefined;
        await user.save();

        // CORRECCIÓN: Apuntando al Frontend público de Render en lugar de localhost
        res.redirect('https://sirid-systems-1.onrender.com/pages/login.html?verificado=true');
    } catch (error) {
        res.status(500).send('Error al verificar la cuenta.');
    }
});

// ==========================================
// 3. LOGIN TRADICIONAL
// ==========================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.trim().toLowerCase() });
        
        if (!user) return res.status(400).json({ msg: 'Usuario no encontrado' });
        if (!user.verificado) return res.status(403).json({ msg: 'Verifica tu correo electrónico para ingresar.' });

        // Si el usuario se registró con Google, no tendrá contraseña tradicional
        if (!user.password) return res.status(400).json({ msg: 'Inicia sesión con Google.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Contraseña incorrecta' });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '2h' });

        res.json({ token, user: { id: user._id, email: user.email, nombre: user.nombre, apellidos: user.apellidos } });
    } catch (err) {
        res.status(500).json({ msg: 'Error en el servidor' });
    }
});

// ==========================================
// 4. LOGIN CON GOOGLE
// ==========================================
router.post('/google', async (req, res) => {
    try {
        const { credential } = req.body;
        
        // Desencriptar el token de Google
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        
        // Buscar si ya existe en nuestra BD
        const normalizedEmail = payload.email.trim().toLowerCase();
        let user = await User.findOne({ email: normalizedEmail });
        
        if (!user) {
            // Si no existe, lo registramos automáticamente ya verificado
            user = new User({
                nombre: payload.given_name,
                apellidos: payload.family_name || '',
                email: normalizedEmail,
                verificado: true // Google ya validó su correo
            });
            await user.save();
        } else if (!user.verificado) {
            user.verificado = true;
            await user.save();
        }

        // Generar nuestro propio JWT para la sesión
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '2h' });

        res.json({ token, user: { id: user._id, email: user.email, nombre: user.nombre } });
    } catch (error) {
        console.error(error);
        res.status(401).json({ msg: 'Token de Google inválido' });
    }
});

module.exports = router;