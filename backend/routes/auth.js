const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const router = express.Router();

function authenticateToken(req, res, next) {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

    if (!token) return res.status(401).json({ msg: 'Sesión no válida.' });

    try {
        req.userId = jwt.verify(token, process.env.JWT_SECRET).id;
        next();
    } catch (error) {
        return res.status(401).json({ msg: 'Tu sesión expiró. Inicia sesión nuevamente.' });
    }
}

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

async function sendPasswordResetEmail({ recipient, name, resetUrl }) {
    await transporter.sendMail({
        from: `Project-GymGo <${verificationSender}>`,
        to: recipient,
        replyTo: process.env.EMAIL_REPLY_TO || verificationSender,
        subject: 'Restablece tu contraseña | Project-GymGo',
        html: `<h2>Hola ${name},</h2>
               <p>Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p>
               <p>Este enlace es válido durante 30 minutos y solo puede usarse una vez:</p>
               <a href="${resetUrl}">Restablecer contraseña</a>
               <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>`
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

router.post('/forgot-password', async (req, res) => {
    const genericMessage = 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.';
    try {
        const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        if (!EMAIL_PATTERN.test(email)) return res.status(200).json({ msg: genericMessage });

        const user = await User.findOne({ email });
        if (!user || !user.password) return res.status(200).json({ msg: genericMessage });

        const rawToken = crypto.randomBytes(32).toString('hex');
        user.passwordResetToken = crypto.createHash('sha256').update(rawToken).digest('hex');
        user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
        await user.save();

        const resetUrl = `${process.env.FRONTEND_PUBLIC_URL || 'https://sirid-systems-1.onrender.com'}/pages/reset-password.html?token=${rawToken}`;
        await sendPasswordResetEmail({ recipient: user.email, name: user.nombre, resetUrl });
        return res.status(200).json({ msg: genericMessage });
    } catch (error) {
        console.error('Error solicitando restablecimiento:', error.message);
        return res.status(200).json({ msg: genericMessage });
    }
});

router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (typeof token !== 'string' || typeof password !== 'string' || password.length < 8 || password.length > 64) {
            return res.status(400).json({ msg: 'El enlace o la nueva contraseña no son válidos.' });
        }

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const user = await User.findOne({ passwordResetToken: hashedToken, passwordResetExpires: { $gt: new Date() } });
        if (!user) return res.status(400).json({ msg: 'El enlace es inválido o ya expiró.' });

        const normalizedPassword = normalizeText(password);
        const personalData = [user.nombre, user.apellidos, user.email].map(normalizeText).filter(Boolean);
        if (COMMON_PASSWORDS.has(normalizedPassword) || personalData.some((value) => value.length > 3 && value === normalizedPassword)) {
            return res.status(400).json({ msg: 'La contraseña es común o coincide con tus datos personales.' });
        }

        user.password = await bcrypt.hash(password, await bcrypt.genSalt(10));
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();
        res.json({ msg: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
    } catch (error) {
        res.status(500).json({ msg: 'No se pudo actualizar la contraseña.' });
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

router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-password -tokenVerificacion');
        if (!user) return res.status(404).json({ msg: 'Usuario no encontrado.' });
        res.json({ user });
    } catch (error) {
        res.status(500).json({ msg: 'No se pudo cargar tu perfil.' });
    }
});

router.patch('/me', authenticateToken, async (req, res) => {
    try {
        const { nombre, apellidos, fechaNacimiento, currentPassword, newPassword } = req.body;
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ msg: 'Usuario no encontrado.' });

        if (nombre !== undefined) {
            if (typeof nombre !== 'string' || nombre.trim().length < 2) return res.status(400).json({ msg: 'Escribe un nombre válido.' });
            user.nombre = nombre.trim();
        }
        if (apellidos !== undefined) {
            if (typeof apellidos !== 'string' || apellidos.trim().length < 2) return res.status(400).json({ msg: 'Escribe apellidos válidos.' });
            user.apellidos = apellidos.trim();
        }
        if (fechaNacimiento !== undefined) {
            if (!isValidBirthDate(fechaNacimiento)) return res.status(400).json({ msg: 'La fecha de nacimiento no es válida.' });
            user.fechaNacimiento = fechaNacimiento;
        }
        if (newPassword !== undefined && newPassword !== '') {
            if (!user.password) return res.status(400).json({ msg: 'Esta cuenta usa Google para iniciar sesión.' });
            if (typeof currentPassword !== 'string' || !(await bcrypt.compare(currentPassword, user.password))) return res.status(400).json({ msg: 'La contraseña actual no es correcta.' });
            if (newPassword.length < 8 || newPassword.length > 64) return res.status(400).json({ msg: 'La nueva contraseña debe tener entre 8 y 64 caracteres.' });
            user.password = await bcrypt.hash(newPassword, await bcrypt.genSalt(10));
        }

        await user.save();
        res.json({ msg: 'Perfil actualizado correctamente.', user: { id: user._id, nombre: user.nombre, apellidos: user.apellidos, email: user.email, fechaNacimiento: user.fechaNacimiento, verificado: user.verificado } });
    } catch (error) {
        res.status(500).json({ msg: 'No se pudo actualizar tu perfil.' });
    }
});

module.exports = router;