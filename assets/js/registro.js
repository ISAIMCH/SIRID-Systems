const COMMON_PASSWORDS = new Set([
    '12345678', '123456789', 'password', 'contraseña', 'qwerty123',
    'qwertyui', 'abc12345', 'admin123', 'letmein123', 'welcome1',
    'iloveyou', '00000000', '11111111', 'gymgo123'
]);

const normalizeText = (value) => value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function isValidEmail(email) {
    return typeof email === 'string' && email.length <= 254 && EMAIL_PATTERN.test(email.trim());
}

function isValidBirthDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    return year >= 1900 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date.getTime() <= todayUtc;
}

function getBirthDateValue(day, month, year) {
    if (!day || !month || !year) return '';
    return `${year.padStart(4, '0')}-${month}-${day.padStart(2, '0')}`;
}

function passwordChecks(password, userData) {
    const normalizedPassword = normalizeText(password);
    const personalValues = [userData.email, userData.nombre, userData.apellidos]
        .map(normalizeText)
        .filter(Boolean);
    const emailName = normalizeText(userData.email).split('@')[0];
    const isPersonal = personalValues.some((value) => value === normalizedPassword || (value.length > 3 && normalizedPassword === value)) || normalizedPassword === emailName;

    return {
        length: password.length >= 8 && password.length <= 64,
        common: !COMMON_PASSWORDS.has(normalizedPassword),
        personal: !isPersonal
    };
}

function updatePasswordMeter() {
    const password = document.getElementById('regPassword').value;
    const userData = {
        email: document.getElementById('regEmail').value,
        nombre: document.getElementById('regNombre').value,
        apellidos: document.getElementById('regApellidos').value
    };
    const checks = passwordChecks(password, userData);
    const meter = document.getElementById('passwordMeter');
    const status = document.getElementById('passwordStatus');
    const score = Number(checks.length) + Number(checks.common) + Number(checks.personal) + (password.length >= 12 ? 1 : 0) + (/[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password) ? 1 : 0);

    meter.className = 'password-meter';
    if (password) meter.classList.add(score <= 2 ? 'is-weak' : score <= 4 ? 'is-medium' : 'is-strong');
    status.className = 'password-status';
    if (!password) status.textContent = 'Usa entre 8 y 64 caracteres.';
    else if (!checks.length) { status.textContent = 'La contraseña debe tener entre 8 y 64 caracteres.'; status.classList.add('is-invalid'); }
    else if (!checks.common || !checks.personal) { status.textContent = !checks.common ? 'Esta contraseña es común o comprometida.' : 'No puede coincidir con tus datos personales.'; status.classList.add('is-invalid'); }
    else { status.textContent = score >= 5 ? 'Contraseña segura.' : 'Contraseña normal.'; status.classList.add('is-valid'); }
    return checks;
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('registroForm');
    const password = document.getElementById('regPassword');
    const confirmation = document.getElementById('regPasswordConfirm');
    const confirmStatus = document.getElementById('confirmStatus');
    const email = document.getElementById('regEmail');
    const birthDay = document.getElementById('regDiaNac');
    const birthMonth = document.getElementById('regMesNac');
    const birthYear = document.getElementById('regAnioNac');
    const birthDateStatus = document.getElementById('birthDateStatus');
    const today = new Date();
    const currentDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    function validateBirthDateFields() {
        const birthDate = getBirthDateValue(birthDay.value, birthMonth.value, birthYear.value);
        const isValid = isValidBirthDate(birthDate);
        const message = !birthDay.value || !birthMonth.value || !birthYear.value
            ? 'Completa día, mes y año.'
            : isValid ? '' : 'Escribe una fecha de nacimiento válida.';
        birthDateStatus.textContent = message;
        [birthDay, birthMonth, birthYear].forEach((field) => field.setCustomValidity(message));
        return isValid;
    }

    ['regPassword', 'regEmail', 'regNombre', 'regApellidos'].forEach((id) => document.getElementById(id).addEventListener('input', updatePasswordMeter));
    email.addEventListener('input', () => email.setCustomValidity(isValidEmail(email.value) ? '' : 'Escribe un correo electrónico válido.'));
    birthDay.addEventListener('input', () => {
        birthDay.value = birthDay.value.replace(/\D/g, '').slice(0, 2);
        validateBirthDateFields();
    });
    birthMonth.addEventListener('change', validateBirthDateFields);
    birthYear.addEventListener('input', () => {
        birthYear.value = birthYear.value.replace(/\D/g, '').slice(0, 4);
        validateBirthDateFields();
    });
    confirmation.addEventListener('input', () => {
        confirmStatus.textContent = confirmation.value && confirmation.value !== password.value ? 'Las contraseñas no coinciden.' : confirmation.value ? 'Las contraseñas coinciden.' : '';
        confirmStatus.className = `password-status ${confirmation.value && confirmation.value !== password.value ? 'is-invalid' : confirmation.value ? 'is-valid' : ''}`;
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const userData = {
            nombre: document.getElementById('regNombre').value.trim(),
            apellidos: document.getElementById('regApellidos').value.trim(),
            fechaNacimiento: getBirthDateValue(birthDay.value, birthMonth.value, birthYear.value),
            email: email.value.trim().toLowerCase(),
            password: password.value
        };
        const checks = updatePasswordMeter();
        if (!isValidEmail(userData.email) || !validateBirthDateFields() || userData.fechaNacimiento > currentDate) {
            alert('Revisa el formato del correo y la fecha de nacimiento.');
            return;
        }
        if (!checks.length || !checks.common || !checks.personal || password.value !== confirmation.value) {
            alert('Revisa los requisitos de la contraseña y su confirmación.');
            return;
        }
        try {
            const response = await fetch('http://localhost:3000/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(userData) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.msg || 'No se pudo crear la cuenta.');
            alert('Cuenta creada exitosamente.');
            window.location.href = 'login.html';
        } catch (error) {
            alert(error.message || 'No se pudo conectar con el servidor.');
        }
    });
});