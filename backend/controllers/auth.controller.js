const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

function serializeUser(user) {
    return {
        id: user._id,
        _id: user._id,
        firstName: user.nombre,
        lastName: user.apellidos || '',
        email: user.email,
        role: user.role || 'Cliente',
        status: user.status
    };
}

async function getUsers(req, res) {
    try {
        const users = await User.find().select('-password -tokenVerificacion -passwordResetToken -passwordResetExpires');
        res.json(users.map(serializeUser));
    } catch (error) {
        console.error('Error cargando usuarios:', error.message);
        res.status(500).json({ msg: 'No se pudo cargar el directorio de usuarios.' });
    }
}

async function createUser(req, res) {
    try {
        const { firstName, lastName, email, password, role } = req.body;
        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

        if (!firstName?.trim() || !lastName?.trim() || !EMAIL_PATTERN.test(normalizedEmail)) {
            return res.status(400).json({ msg: 'Nombre, apellidos y correo válido son obligatorios.' });
        }
        if (typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ msg: 'La contraseña debe tener al menos 8 caracteres.' });
        }
        if (role && !USER_ROLES.includes(role)) {
            return res.status(400).json({ msg: 'El rol no es válido.' });
        }
        if (await User.exists({ email: normalizedEmail })) {
            return res.status(400).json({ msg: 'El correo ya está registrado.' });
        }

        const user = await User.create({
            nombre: firstName.trim(),
            apellidos: lastName.trim(),
            email: normalizedEmail,
            password: await bcrypt.hash(password, await bcrypt.genSalt(10)),
            role: role || 'Cliente',
            verificado: true
        });

        res.status(201).json({ user: serializeUser(user) });
    } catch (error) {
        console.error('Error creando usuario:', error.message);
        res.status(500).json({ msg: 'No se pudo crear el usuario.' });
    }
}

async function updateUser(req, res) {
    try {
        const { id } = req.params;
        const { firstName, lastName, email, role } = req.body;
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ msg: 'El identificador no es válido.' });
        if (role !== undefined && !USER_ROLES.includes(role)) return res.status(400).json({ msg: 'El rol no es válido.' });

        const updates = {};
        if (firstName !== undefined) updates.nombre = firstName.trim();
        if (lastName !== undefined) updates.apellidos = lastName.trim();
        if (email !== undefined) updates.email = email.trim().toLowerCase();
        if (role !== undefined) updates.role = role;
        if (updates.email && !EMAIL_PATTERN.test(updates.email)) return res.status(400).json({ msg: 'El correo no es válido.' });

        const user = await User.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
            .select('-password -tokenVerificacion -passwordResetToken -passwordResetExpires');
        if (!user) return res.status(404).json({ msg: 'Usuario no encontrado.' });

        res.json({ user: serializeUser(user) });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ msg: 'El correo ya está registrado.' });
        console.error('Error actualizando usuario:', error.message);
        res.status(500).json({ msg: 'No se pudo actualizar el usuario.' });
    }
}

const USER_ROLES = ['Admin', 'Coach', 'Cliente'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = { getUsers, createUser, updateUser };