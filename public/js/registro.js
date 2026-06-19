let horaCitaOriginal = null;
let tipoLlegadaActual = "No Citado";

if (!window.AzUtils) {
    console.error("AzUtils no está disponible. Verifica que /js/shared-config.js cargue antes que registro.js");
}

// =============================
// ELEMENTOS PRINCIPALES
// =============================
const selectorInicial = document.getElementById('selector-inicial');
const btnConCita = document.getElementById('btn-con-cita');
const btnSinCita = document.getElementById('btn-sin-cita');
const buscadorCaja = document.getElementById('buscador-caja');
const formRegistro = document.getElementById('formRegistroOp');
const alertaMatch = document.getElementById('alerta-match');
const btnVolverInicio = document.getElementById('btn-volver-inicio');

const inputBusqueda = document.getElementById('input-busqueda');
const resultadosBusqueda = document.getElementById('resultados-busqueda');
const btnBuscar = document.getElementById('btn-buscar');

const modalExito = document.getElementById('modalExito');
const textoExitoRegistro = document.getElementById('textoExitoRegistro');
const contadorRegreso = document.getElementById('contador-regreso');
const btnVerMiEstatus = document.getElementById('btnVerMiEstatus');
const btnCerrarExito = document.getElementById('btnCerrarExito');
const btnVolverForm = document.getElementById('btn-volver-form');  // ← AGREGA ESTA LÍNEA

let ultimoTurnoRegistradoId = null;

// =============================
// HELPERS UI
// =============================
function resetPantallaRegistro() {
    document.getElementById('formRegistroOp').reset();
    document.getElementById('turno_id').value = '';

    horaCitaOriginal = null;
    tipoLlegadaActual = "No Citado";
    ultimoTurnoRegistradoId = null;

    alertaMatch.style.display = 'none';
    alertaMatch.innerHTML = '✅ Cita encontrada. Por favor, completa los datos faltantes.';
    alertaMatch.style.backgroundColor = '#e0f2fe';
    alertaMatch.style.color = '#0369a1';

    resultadosBusqueda.innerHTML = '';
    if (inputBusqueda) inputBusqueda.value = '';

    selectorInicial.style.display = 'block';
    buscadorCaja.style.display = 'none';
    formRegistro.style.display = 'none';

    btnConCita.classList.remove('active');
    btnSinCita.classList.remove('active');

    window.AzUtils.fillProveedorSelect({
        categoriaSelector: '#categoria',
        proveedorSelector: '#proveedor'
    }).catch(() => {});

    window.AzUtils.applyUnitConfig({
        tipoUnidadSelector: '#tipo_unidad',
        cargaSelector: '#carga'
    });
}

// =============================
// BOTONES SÍ O NO CITA
// =============================
btnSinCita.addEventListener('click', async () => {
    selectorInicial.style.display = 'none';
    buscadorCaja.style.display = 'none';
    formRegistro.style.display = 'block';
    alertaMatch.style.display = 'none';

    document.getElementById('formRegistroOp').reset();
    document.getElementById('turno_id').value = '';
    horaCitaOriginal = null;
    tipoLlegadaActual = "No Citado";

    await window.AzUtils.fillProveedorSelect({
        categoriaSelector: '#categoria',
        proveedorSelector: '#proveedor'
    });

    window.AzUtils.applyUnitConfig({
        tipoUnidadSelector: '#tipo_unidad',
        cargaSelector: '#carga'
    });

    // Enfocar en el primer campo
    document.getElementById('nombre_operador').focus();
});

btnConCita.addEventListener('click', () => {
    selectorInicial.style.display = 'none';
    buscadorCaja.style.display = 'block';
    formRegistro.style.display = 'none';

    inputBusqueda.focus();
});

// Botón volver atrás
btnVolverInicio.addEventListener('click', resetPantallaRegistro);
btnVolverForm.addEventListener('click', resetPantallaRegistro);  // ← AGREGA ESTA LÍNEA

// =============================
// BÚSQUEDA POR ENTER
// =============================
inputBusqueda.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        btnBuscar.click();
    }
});


function abrirModalExito(turnoId) {
    ultimoTurnoRegistradoId = turnoId || null;

    if (textoExitoRegistro) {
        textoExitoRegistro.innerText = turnoId
        ? `Tu registro fue procesado correctamente. ID de turno: ${turnoId}`
        : 'Tu registro fue procesado correctamente.';
    }

    if (contadorRegreso) {
        contadorRegreso.innerText = '—';
    }

    if (modalExito) {
        modalExito.style.display = 'flex';
        setTimeout(() => modalExito.classList.add('active'), 10);
    }
}

function cerrarModalExito() {
    if (!modalExito) return;
    modalExito.classList.remove('active');

    setTimeout(() => {
        modalExito.style.display = 'none';
        resetPantallaRegistro();
    }, 200);
}

function esCitaParaHoy(fechaString) {
    if (!fechaString) return false;

    const fechaCita = new Date(fechaString.replace(' ', 'T'));
    const hoy = new Date();

    return (
        fechaCita.getDate() === hoy.getDate() &&
        fechaCita.getMonth() === hoy.getMonth() &&
        fechaCita.getFullYear() === hoy.getFullYear()
    );
}

function renderCantidad(carga) {
    const cont = document.getElementById('contenedorCantidad');

    if (!cont) return;

    if (carga === 'Granel') {
        cont.innerHTML = `
            <label>Cantidad (Cajas o Piezas)</label>
            <input type="number" id="cantidad" placeholder="Ej. 150" min="1" required>
        `;
    } else if (carga === 'Palletizado') {
        let opciones = '';

        for (let i = 1; i <= 30; i++) {
            opciones += `<option value="${i}">${i}</option>`;
        }

        cont.innerHTML = `
            <label>Cantidad (Tarimas)</label>
            <select id="cantidad" required>
                <option value="">Selecciona cantidad...</option>
                ${opciones}
            </select>
        `;
    } else {
        cont.innerHTML = `
            <label>Cantidad</label>
            <input type="text" id="cantidad" placeholder="Cantidad" required>
        `;
    }
}

// =============================
// CARGA DINÁMICA DE CAMPOS
// =============================
document.getElementById('categoria').addEventListener('change', async () => {
    await window.AzUtils.fillProveedorSelect({
        categoriaSelector: '#categoria',
        proveedorSelector: '#proveedor'
    });
});

document.getElementById('tipo_unidad').addEventListener('change', () => {
    window.AzUtils.applyUnitConfig({
        tipoUnidadSelector: '#tipo_unidad',
        cargaSelector: '#carga'
    });

    const tipoUnidad = document.getElementById('tipo_unidad').value;
    const config = window.AzUtils.getUnitConfig(tipoUnidad);

    if (config && config.carga) {
        renderCantidad(config.carga);
    }
});

// =============================
// MODO CON CITA / SIN CITA
// =============================
btnSinCita.addEventListener('click', async () => {
    btnSinCita.classList.add('active');
    btnConCita.classList.remove('active');

    buscadorCaja.style.display = 'none';
    formRegistro.style.display = 'block';
    alertaMatch.style.display = 'none';

    document.getElementById('formRegistroOp').reset();
    document.getElementById('turno_id').value = '';
    horaCitaOriginal = null;
    tipoLlegadaActual = "No Citado";

    await window.AzUtils.fillProveedorSelect({
        categoriaSelector: '#categoria',
        proveedorSelector: '#proveedor'
    });

    window.AzUtils.applyUnitConfig({
        tipoUnidadSelector: '#tipo_unidad',
        cargaSelector: '#carga'
    });
});

btnConCita.addEventListener('click', () => {
    btnConCita.classList.add('active');
    btnSinCita.classList.remove('active');

    buscadorCaja.style.display = 'block';
    formRegistro.style.display = 'none';
});

// =============================
// BUSCADOR DE CITAS
// =============================
btnBuscar.addEventListener('click', async () => {
    inputBusqueda.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        btnBuscar.click();
    }
});

    const query = inputBusqueda.value.toLowerCase().trim();

    if (query.length < 2) {
        AzToast.warning("Ingresa al menos 2 caracteres para buscar.", {
            title: 'Búsqueda incompleta'
        });
        return;
    }

    resultadosBusqueda.innerHTML = "<p>Buscando en el historial del sistema...</p>";

    try {
        const [resProgramados, resTurnos, resHistorial] = await Promise.all([
            fetch('/api/programados'),
            fetch('/api/turnos'),
            fetch('/api/historial')
        ]);

        if (!resProgramados.ok || !resTurnos.ok || !resHistorial.ok) {
            throw new Error('No fue posible consultar una o más fuentes de datos.');
        }

        const programados = await resProgramados.json();
        const turnos = await resTurnos.json();
        const historial = await resHistorial.json();

        const todoElHistorial = [...programados, ...turnos, ...historial];

        const coincidencias = todoElHistorial.filter(t =>
            (t.placas && t.placas.toLowerCase().includes(query)) ||
            (t.proveedor && t.proveedor.toLowerCase().includes(query)) ||
            (t.folio && t.folio.toLowerCase().includes(query)) ||
            (t.telefono && t.telefono.toLowerCase().includes(query)) ||
            (t.nombre_operador && t.nombre_operador.toLowerCase().includes(query))
        );

        resultadosBusqueda.innerHTML = "";

        if (coincidencias.length === 0) {
            resultadosBusqueda.innerHTML = `
                <p class="resultado-vacio">No se encontró ningún registro en el sistema con esos datos.</p>
            `;
            return;
        }

        coincidencias.forEach(cita => {
            const div = document.createElement('div');
            div.className = 'resultado-item';

            const fechaBase = cita.hora_cita || cita.hora_llegada;
            const fechaBonita = fechaBase
                ? new Date(fechaBase.replace(' ', 'T')).toLocaleString()
                : 'Fecha por definir';

            if (cita.estatus === 'Programado') {
                const citaEsHoy = esCitaParaHoy(cita.hora_cita);
                const badgeColor = citaEsHoy ? '#dbeafe' : '#fef08a';
                const badgeTextColor = citaEsHoy ? '#1e40af' : '#854d0e';

                div.style.cursor = 'pointer';
                div.style.borderLeft = '4px solid #3b82f6';

                div.innerHTML = `
                    <span class="tag-cita" style="background:${badgeColor}; color:${badgeTextColor};">
                        🗓️ Cita Disponible: ${fechaBonita}
                    </span><br>
                    <strong style="font-size: 1.05rem; color: #111827;">
                        Placas: ${cita.placas || 'Revisar'}
                    </strong>
                    | Proveedor: ${cita.proveedor || '-'}<br>
                    <small style="color:#666;">
                        Folio de compra: ${cita.folio || 'N/A'}
                    </small>
                    <div style="margin-top: 8px; font-size: 0.85rem; color: #059669; font-weight: bold;">
                        ✅ Toca aquí para registrar tu llegada
                    </div>
                `;

                div.addEventListener('click', async () => {
                    if (!citaEsHoy) {
                        const confirmar = await AzConfirm({
                            title: 'Cita fuera de fecha',
                            message:
                                `Tu cita NO está programada para hoy.\n\n` +
                                `Fecha de tu cita: ${fechaBonita}\n\n` +
                                `Podemos colocarte en la fila actual, pero perderás tu turno programado y pasarás como "Sin Cita".\n\n` +
                                `¿Deseas continuar?`,
                            confirmText: 'Sí, continuar',
                            cancelText: 'Cancelar',
                            type: 'warning'
                        });

                        if (confirmar) {
                            seleccionarCita(cita, true);
                        }
                    } else {
                        seleccionarCita(cita, false);
                    }
                });

            } else {
                let badgeColor = '#e5e7eb';
                let badgeTextColor = '#4b5563';
                let textoEstado = 'Finalizada / Caducada';

                if (cita.estatus === 'En Espera') {
                    badgeColor = '#fef9c3';
                    badgeTextColor = '#854d0e';
                    textoEstado = 'Ya registrado (En Patio)';
                } else if (cita.estatus === 'En Descarga') {
                    badgeColor = '#bbf7d0';
                    badgeTextColor = '#166534';
                    textoEstado = 'En Andén (Descargando)';
                }

                div.style.cursor = 'not-allowed';
                div.style.opacity = '0.75';
                div.style.backgroundColor = '#f9fafb';
                div.style.borderLeft = '4px solid #9ca3af';

                div.innerHTML = `
                    <span class="tag-cita" style="background:${badgeColor}; color:${badgeTextColor};">
                        🚫 ${textoEstado}
                    </span><br>
                    <strong>Placas:</strong> ${cita.placas || 'Revisar'} |
                    <strong>Proveedor:</strong> ${cita.proveedor || '-'}<br>
                    <small style="color:#666;">Folio: ${cita.folio || 'N/A'}</small><br>
                    <small style="color:#ef4444; font-weight:bold; display:block; margin-top:5px;">
                        Esta cita ya fue procesada o no está disponible.
                    </small>
                `;

                div.addEventListener('click', () => {
                    AzToast.info(
                        `Este registro se encuentra en estado "${cita.estatus}". Ya no puedes registrarte usando esta información.`,
                        { title: 'Registro no disponible' }
                    );
                });
            }

            resultadosBusqueda.appendChild(div);
        });

    } catch (error) {
        console.error("Error al buscar citas:", error);
        resultadosBusqueda.innerHTML = `<p class="resultado-vacio error">Error de conexión.</p>`;

        AzToast.error(
            'No fue posible consultar citas. Si esta pantalla ya es pública, recuerda que /api/programados también debe ser pública.',
            { title: 'Error de búsqueda' }
        );
    }
});

// =============================
// SELECCIONAR CITA
// =============================
async function seleccionarCita(cita, perdioCita = false) {
    document.getElementById('turno_id').value = cita.id || '';
    document.getElementById('nombre_operador').value = cita.nombre_operador || '';
    document.getElementById('telefono').value = cita.telefono || '';
    document.getElementById('placas').value = (cita.placas && cita.placas !== 'Revisar') ? cita.placas : '';

    const selectUnidad = document.getElementById('tipo_unidad');
    if (selectUnidad.querySelector(`option[value="${cita.tipo_unidad}"]`)) {
        selectUnidad.value = cita.tipo_unidad;
    } else {
        selectUnidad.value = "";
    }

    window.AzUtils.applyUnitConfig({
        tipoUnidadSelector: '#tipo_unidad',
        cargaSelector: '#carga'
    });

    let catUpper = cita.categoria ? cita.categoria.toUpperCase() : "";

    if (catUpper.includes('PISO')) {
        document.getElementById('categoria').value = 'PISO';
    } else if (catUpper.includes('BAÑO') || catUpper.includes('BANO')) {
        document.getElementById('categoria').value = 'BAÑO';
    } else if (catUpper.includes('GRIFER')) {
        document.getElementById('categoria').value = 'GRIFERIA';
    } else if (catUpper.includes('GENERAL')) {
        document.getElementById('categoria').value = 'GENERAL';
    } else {
        document.getElementById('categoria').value = "";
    }

    await window.AzUtils.fillProveedorSelect({
        categoriaSelector: '#categoria',
        proveedorSelector: '#proveedor',
        preserveValue: cita.proveedor || ''
    });

    if (perdioCita) {
    horaCitaOriginal = cita.hora_cita || null;
    tipoLlegadaActual = "Citado fuera de fecha";
    alertaMatch.innerHTML = '⚠️ Cita fuera de fecha. Se registrará como <b>Citado fuera de fecha</b>. Completa tus datos.';
    alertaMatch.style.backgroundColor = '#fef08a';
    alertaMatch.style.color = '#854d0e';
    } else {
        horaCitaOriginal = cita.hora_cita || null;
        tipoLlegadaActual = "Citado";
        alertaMatch.innerHTML = '✅ Cita encontrada. Por favor, completa los datos faltantes.';
        alertaMatch.style.backgroundColor = '#e0f2fe';
        alertaMatch.style.color = '#0369a1';
    }

    buscadorCaja.style.display = 'none';
    formRegistro.style.display = 'block';
    alertaMatch.style.display = 'block';

    const config = window.AzUtils.getUnitConfig(cita.tipo_unidad);
    if (config && config.carga) {
    renderCantidad(config.carga);
}
}

// =============================
// VALIDACIONES
// =============================
document.getElementById('formRegistroOp').addEventListener('submit', async (e) => {
    e.preventDefault();

    const categoria = document.getElementById('categoria').value.trim();
    const proveedor = document.getElementById('proveedor').value.trim();
    const tipoUnidad = document.getElementById('tipo_unidad').value.trim();
    const placas = document.getElementById('placas').value.trim().toUpperCase();
    const nombreOperador = document.getElementById('nombre_operador').value.trim();
    const telefono = document.getElementById('telefono').value.trim();
    const cantidad = document.getElementById('cantidad').value.trim();

    const configUnidad = window.AzUtils.getUnitConfig(tipoUnidad);
    const carga = configUnidad ? configUnidad.carga : '';

    if (!categoria) {
        AzToast.warning("Debes seleccionar una Categoría / Área de Destino.", {
            title: 'Dato obligatorio'
        });
        return;
    }

    if (!proveedor) {
        AzToast.warning("Debes seleccionar un Proveedor.", {
            title: 'Dato obligatorio'
        });
        return;
    }

    if (!tipoUnidad) {
        AzToast.warning("Debes seleccionar un Tipo de Unidad.", {
            title: 'Dato obligatorio'
        });
        return;
    }

    if (!configUnidad) {
        AzToast.error("El tipo de unidad seleccionado no tiene configuración válida.", {
            title: 'Configuración inválida'
        });
        return;
    }

    // ========== VALIDACIÓN DE PLACAS ==========
    const placasLimpias = placas.replace(/[^A-Z0-9]/g, '');
    if (placasLimpias.length < 6 || placasLimpias.length > 8) {
        AzToast.warning("Las placas deben tener entre 6 y 8 caracteres alfanuméricos.", {
            title: 'Placas inválidas'
        });
        return;
    }

    if (!/^[A-Z0-9]{6,8}$/.test(placasLimpias)) {
        AzToast.warning("Las placas solo deben contener letras (mayúsculas) y números.", {
            title: 'Formato de placas inválido'
        });
        return;
    }

    if (!nombreOperador) {
        AzToast.warning("Debes ingresar tu Nombre Completo.", {
            title: 'Dato obligatorio'
        });
        return;
    }

    // ========== VALIDACIÓN DE TELÉFONO ==========
    const telefonoLimpio = telefono.replace(/\D/g, '');
    if (telefonoLimpio.length !== 10) {
        AzToast.warning("El teléfono debe tener exactamente 10 dígitos.", {
            title: 'Teléfono inválido'
        });
        document.getElementById('telefono').focus();
        return;
    }

    if (!/^\d{10}$/.test(telefonoLimpio)) {
        AzToast.warning("El teléfono solo debe contener números.", {
            title: 'Formato de teléfono inválido'
        });
        return;
    }

    if (!cantidad) {
        AzToast.warning("Debes ingresar la cantidad.", {
            title: 'Dato obligatorio'
        });
        return;
    }

    const btn = document.getElementById('btnGuardar');
    btn.disabled = true;
    btn.textContent = "Registrando llegada...";

    const idTurno = document.getElementById('turno_id').value;
    // Si viene de cita → pasa a En Espera
    // Si no → se queda como flujo normal
    const estatusFinal = idTurno ? "En Espera, con cita" : "En Espera, sin cita";
    const datos = {
        folio: "",
        nombre_operador: nombreOperador,
        telefono: telefonoLimpio,
        tipo_unidad: tipoUnidad,
        proveedor,
        placas: placasLimpias,
        carga,
        cantidad,
        categoria,
        tipo_llegada: tipoLlegadaActual,
        hora_cita: horaCitaOriginal,
        observaciones: tipoLlegadaActual === "Citado fuera de fecha"
        ? "Check-in de cita fuera de fecha realizado en kiosco"
        : idTurno
        ? "Check-in de cita realizado en kiosco"
        : "Auto-registro sin cita",
        tipo_operacion: "RECEPCION",
        prioridad: configUnidad.prioridad,
        tamano_unidad: configUnidad.tamano_unidad,
        estatus: estatusFinal
    };


    try {
        const idTurno = document.getElementById('turno_id').value;

        const url = idTurno ? '/api/modificar-turno' : '/api/registrar-turno';

        if (idTurno) {
            datos.id = Number(idTurno);
        }

        console.log('ID turno:', idTurno);
        console.log('URL:', url);
        console.log('Payload:', datos);

        const respuesta = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        const data = await respuesta.json().catch(() => ({}));
        console.log('Status:', respuesta.status);
        console.log('Respuesta servidor:', data);

        if (!respuesta.ok) {
            AzToast.error(data.error || `Error HTTP ${respuesta.status}`, {
                title: 'Error al procesar'
            });
            btn.disabled = false;
            btn.textContent = "Registrar mi Llegada a Patio";
            return;
        }

        AzToast.success('Tu unidad fue registrada correctamente.', {
            title: 'Registro exitoso'
        });

        const turnoIdFinal = data.id || data.turno_id || idTurno || null;

        abrirModalExito(turnoIdFinal);

        btn.disabled = false;
        btn.textContent = "Registrar mi Llegada a Patio";

    } catch (error) {
        console.error("Error operativo:", error);

        AzToast.error("Error de conexión al servidor.", {
            title: 'Conexión'
        });

        btn.disabled = false;
        btn.textContent = "Registrar mi Llegada a Patio";
    }
});

// =============================
// EVENTOS DEL MODAL DE ÉXITO
// =============================
if (btnVerMiEstatus) {
    btnVerMiEstatus.addEventListener('click', () => {
        if (!ultimoTurnoRegistradoId) {
            AzToast.warning('No se encontró el identificador del turno para consultar el estatus.', {
                title: 'Sin turno'
            });
            return;
        }

        window.location.href = `/mi-turno.html?id=${encodeURIComponent(ultimoTurnoRegistradoId)}`;
    });
}

if (btnCerrarExito) {
    btnCerrarExito.addEventListener('click', cerrarModalExito);
}

if (modalExito) {
    modalExito.addEventListener('click', (e) => {
        if (e.target === modalExito) {
            cerrarModalExito();
        }
    });
}