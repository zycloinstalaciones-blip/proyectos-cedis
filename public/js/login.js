function mostrarAlerta(titulo, mensaje) {
    document.getElementById('alertaTitulo').innerText = titulo;
    document.getElementById('alertaMensaje').innerText = mensaje;
    document.getElementById('alertaPersonalizada').style.display = 'flex';
}

function cerrarAlerta() {
    document.getElementById('alertaPersonalizada').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const btnCerrarAlerta = document.getElementById('btnCerrarAlerta');
    const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');

    btnCerrarAlerta.addEventListener('click', cerrarAlerta);

    forgotPasswordBtn.addEventListener('click', (e) => {
        e.preventDefault();
        mostrarAlerta(
            'Recuperación de acceso',
            'Para restablecer tu contraseña, comunícate con el administrador del sistema o con el área de TI.'
        );
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const login = document.getElementById('loginInput').value.trim();
        const password = document.getElementById('password').value.trim();

        if (!login || !password) {
            mostrarAlerta('Campos incompletos', 'Debes ingresar tu usuario o correo y tu contraseña.');
            return;
        }

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login, password })
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                mostrarAlerta(
                    'Acceso denegado',
                    data.error || 'Usuario/correo o contraseña incorrectos.'
                );
                return;
            }

            // opcional: guardar en sessionStorage solo para UI
            sessionStorage.setItem('usuarioActual', JSON.stringify(data.user));

            window.location.href = data.user.homePage || '/login.html';

        } catch (error) {
            console.error('Error en login:', error);
            mostrarAlerta(
                'Error de conexión',
                'No fue posible conectar con el servidor. Intenta nuevamente.'
            );
        }
    });
});


// function obtenerRutaPorRol(rol) {
    //const rolTexto = String(rol || '').toLowerCase();

    // if (rolTexto === 'admin') return '/admin.html';

    // if (
       // rolTexto.includes('oficial') ||
        //rolTexto.includes('jefe') ||
        //rolTexto.includes('jefatura') ||
        //rolTexto.includes('operativo')
    //) {
       // return '/bitacora.html';
    //}

    // Fallback
    //return '/monitor.html';
//}