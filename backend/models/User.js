const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    apellidos: { type: String, default: '' },
    fechaNacimiento: { type: Date },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    verificado: { type: Boolean, default: false },
    tokenVerificacion: { type: String },
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date }
});

module.exports = mongoose.model('User', UserSchema);

