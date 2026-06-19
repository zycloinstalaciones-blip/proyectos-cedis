(function () {
    function obtenerUsuarioActual() {
        const raw = sessionStorage.getItem('usuarioActual');
        if (!raw) return null;

        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    function aplicarUsuarioEnUI() {
        const usuario = obtenerUsuarioActual();
        if (!usuario) return;

        const nombreEls = document.querySelectorAll('[data-usuario-nombre]');
        const rolEls = document.querySelectorAll('[data-usuario-rol]');
        const puestoEls = document.querySelectorAll('[data-usuario-puesto]');
        const loginEls = document.querySelectorAll('[data-usuario-login]');

        nombreEls.forEach(el => el.textContent = usuario.nombre || '-');
        rolEls.forEach(el => el.textContent = usuario.rol || '-');
        puestoEls.forEach(el => el.textContent = usuario.puesto || usuario.rol || '-');
        loginEls.forEach(el => el.textContent = usuario.login || '-');
    }

    function bindLogout() {
        const botones = document.querySelectorAll('[data-logout]');
        botones.forEach(btn => {
            btn.addEventListener('click', () => {
                sessionStorage.removeItem('usuarioActual');
                window.location.href = '/login.html';
            });
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        aplicarUsuarioEnUI();
        bindLogout();
    });

    window.SessionUI = {
        obtenerUsuarioActual
    };
})();