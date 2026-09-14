const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();
const users = [];
router.post('/registro', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Completa todos los campos' });
  if (users.some((user) => user.email === email)) return res.status(409).json({ message: 'El correo ya esta registrado' });
  users.push(new User({ name, email, password: await bcrypt.hash(password, 10) }));
  res.status(201).json({ message: 'Registro creado' });
});
router.post('/login', async (req, res) => {
  const user = users.find((candidate) => candidate.email === req.body.email);
  if (!user || !(await bcrypt.compare(req.body.password || '', user.password))) return res.status(401).json({ message: 'Credenciales invalidas' });
  const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET || 'development-secret', { expiresIn: '2h' });
  res.json({ token });
});
module.exports = router;
