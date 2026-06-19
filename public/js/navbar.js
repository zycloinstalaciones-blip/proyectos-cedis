(function () {
    async function obtenerUsuarioDesdeServidor() {
        try {
            const res = await fetch('/api/me', {
                credentials: 'same-origin'
            });

            if (!res.ok) return null;

            const data = await res.json();
            return data.user || null;
        } catch {
            return null;
        }
    }

    function rutaActual() {
        return window.location.pathname.toLowerCase();
    }

    function esPaginaPublica(pagina) {
        return pagina.includes('/monitor.html') || pagina.includes('/login.html');
    }

    function construirMenu(usuario) {
        const menu = document.getElementById('menuLinks');
        if (!menu) return;

        const rol = usuario.rol;
        const pagina = rutaActual();

        const items = [];

        if (rol === 'admin') {
            items.push(
                { href: '/recepcion.html', label: 'Recepción' },
                { href: '/admin.html', label: 'Administración' },
                { href: '/bitacora.html', label: 'Bitácora' },
                { href: '/monitor.html', label: 'Monitor' },
                { href: '/calendario.html', label: 'Calendario' },
                { href: '/registro.html', label: 'Registro' },
                { href: '/pre-import.html', label: 'Importar Doc.' },
                { href: '/mi-turno.html', label: 'Turnos' },
                { href: '/entradas.html', label: 'Entradas' }
            );
        }

        if (rol === 'operativo') {
            items.push(
                { href: '/admin.html', label: 'Administración' },
                { href: '/monitor.html', label: 'Monitor' }
            );
        }

        if (rol === 'oficial') {
            items.push(
                { href: '/bitacora.html', label: 'Bitácora' },
                { href: '/monitor.html', label: 'Monitor' }
            );
        }

        if (rol === 'registro_operadores') {
            items.push(
                { href: '/monitor.html', label: 'Monitor' }
            );
        }

        if (rol === 'externo') {
            items.push(
                { href: '/monitor.html?tv=1', label: 'Monitor TV' }
            );
        }

        menu.innerHTML = items.map(item => {
            const activa = pagina.includes(item.href.split('?')[0].toLowerCase()) ? 'active' : '';
            return `<a href="${item.href}" class="${activa}">${item.label}</a>`;
        }).join('');
    }

    function ocultarPrivados() {
        document.querySelectorAll('[data-usuario-privado]').forEach(el => {
            el.style.display = 'none';
        });
    }

    async function initNavbar() {
        const pagina = rutaActual();
        const usuario = await obtenerUsuarioDesdeServidor();

        // Si la página es pública y no hay sesión, ocultar lo privado
        if (!usuario && esPaginaPublica(pagina)) {
            ocultarPrivados();
            bindMenu();
            return;
        }

        // Si no hay usuario y la página no es pública
        if (!usuario && !esPaginaPublica(pagina)) {
            window.location.href = '/login.html';
            return;
        }

        if (usuario) {
            document.querySelectorAll('[data-usuario-nombre]').forEach(el => {
                el.textContent = usuario.nombre || '-';
            });

            document.querySelectorAll('[data-usuario-puesto]').forEach(el => {
                el.textContent = usuario.puesto || usuario.rol || '-';
            });

            document.querySelectorAll('[data-nav-title]').forEach(el => {
                el.textContent = document.title || 'Sistema Azulemex';
            });

            construirMenu(usuario);
        }

        bindMenu();
    }

    function bindMenu() {
        const menuToggle = document.getElementById('menuToggle');
        const closeMenu = document.getElementById('closeMenu2');
        const sideMenu = document.getElementById('sideMenu');
        const overlay = document.getElementById('overlay');
        const logoutBtn = document.getElementById('logoutBtn');

        if (menuToggle && sideMenu && overlay) {
            menuToggle.addEventListener('click', () => {
                sideMenu.classList.add('active');
                overlay.classList.add('active');
            });
        }

        if (closeMenu && sideMenu && overlay) {
            closeMenu.addEventListener('click', () => {
                sideMenu.classList.remove('active');
                overlay.classList.remove('active');
            });
        }

        if (overlay && sideMenu) {
            overlay.addEventListener('click', () => {
                sideMenu.classList.remove('active');
                overlay.classList.remove('active');
            });
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                try {
                    await fetch('/api/logout', {
                        method: 'POST',
                        credentials: 'same-origin'
                    });
                } catch (error) {
                    console.error('Error al cerrar sesión:', error);
                }

                sessionStorage.removeItem('usuarioActual');
                window.location.href = '/login.html';
            });
        }
    }

    document.addEventListener('DOMContentLoaded', initNavbar);
})();
