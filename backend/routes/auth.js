const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

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

// Agregar justo arriba de router.post('/login', ...)
router.post('/register', async (req, res) => {
    try {
        // Ahora extraemos todos los datos del formulario
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

        // Validar si el correo ya está registrado
        let user = await User.findOne({ email: normalizedEmail });
        if (user) {
            return res.status(400).json({ msg: 'El correo ya está registrado' });
        }

        // Crear la "sal" y encriptar la contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Crear el nuevo usuario con todos sus datos y guardarlo en MongoDB
        user = new User({
            nombre,
            apellidos,
            fechaNacimiento,
            email: normalizedEmail,
            password: hashedPassword
        });

        await user.save();

        res.status(201).json({ msg: 'Usuario registrado exitosamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Error en el servidor al registrar' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Verificar si el usuario existe
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'Usuario no encontrado' });
        }

        // 2. Comparar la contraseña ingresada con el Hash de la BD
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Contraseña incorrecta' });
        }

        // 3. Generar y enviar el Token (JWT)
        const token = jwt.sign(
            { id: user._id }, 
            process.env.JWT_SECRET, 
            { expiresIn: '2h' }
        );

        // ¡NUEVO! Ahora también enviamos el nombre al frontend
        res.json({ 
            token, 
            user: { 
                id: user._id, 
                email: user.email,
                nombre: user.nombre,       // Añadimos el nombre
                apellidos: user.apellidos  // Añadimos los apellidos
            } 
        });
    } catch (err) {
        res.status(500).json({ msg: 'Error en el servidor' });
    }
});

module.exports = router;