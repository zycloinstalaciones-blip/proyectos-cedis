const statePre = {
    documentos: [],
    documentoActivo: null,
    turnosDisponibles: []
};

// =============================
// ELEMENTOS PRINCIPALES
// =============================
const archivoExcel = document.getElementById('archivoExcel');
const btnImportarExcel = document.getElementById('btnImportarExcel');
const btnActualizarPre = document.getElementById('btnActualizarPre');
const busquedaPre = document.getElementById('busquedaPre');
const filtroEstadoPre = document.getElementById('filtroEstadoPre');
const tablaPreBody = document.getElementById('tablaPreBody');
const countDocsText = document.getElementById('countDocsText');
const resumenImportacion = document.getElementById('resumenImportacion');
const sumDocumentos = document.getElementById('sumDocumentos');
const sumPartidas = document.getElementById('sumPartidas');
const sumPendientes = document.getElementById('sumPendientes');

const estadoVacioDetalle = document.getElementById('estadoVacioDetalle');
const detalleDocumento = document.getElementById('detalleDocumento');
const tablaDetalleBody = document.getElementById('tablaDetalleBody');

const modalCorregirPre = document.getElementById('modalCorregirPre');
const inputCorregirPre = document.getElementById('inputCorregirPre');
const btnGuardarCorreccionPre = document.getElementById('btnGuardarCorreccionPre');

const modalAsignarTurno = document.getElementById('modalAsignarTurno');
const selectTurnoAsignar = document.getElementById('selectTurnoAsignar');
const btnConfirmarAsignacion = document.getElementById('btnConfirmarAsignacion');

const btnEditarPre = document.getElementById('btnEditarPre');
const btnAsignarTurno = document.getElementById('btnAsignarTurno');
const btnEliminarDocumentoPre = document.getElementById('btnEliminarDocumentoPre');

// =============================
// HELPERS UI
// =============================
function abrirModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
}

function cerrarModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
}

function setResumen(data) {
    resumenImportacion.classList.remove('hidden');
    sumDocumentos.textContent = data.documentos_importados ?? 0;
    sumPartidas.textContent = data.partidas_importadas ?? 0;
    sumPendientes.textContent = data.pre_pendientes ?? 0;
}

function badgeEstado(estado) {
    const key = estado || 'importado';
    return `<span class="badge-state estado-${key}">${key.replace('_', ' ')}</span>`;
}

function fmtTotal(doc) {
    const total = doc.total_descarga ?? '';
    const unidad = doc.unidad_total_descarga ?? '';
    return `${total || '-'} ${unidad || ''}`.trim();
}

function limpiarTablaDocumentos() {
    tablaPreBody.innerHTML = '';
}

function resetDetalleDocumento() {
    statePre.documentoActivo = null;
    detalleDocumento.classList.add('hidden');
    estadoVacioDetalle.classList.remove('hidden');
    tablaDetalleBody.innerHTML = '';
}

// =============================
// RENDER DOCUMENTOS
// =============================
function renderListaDocumentos() {
    limpiarTablaDocumentos();

    if (!statePre.documentos.length) {
        tablaPreBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; padding:24px; color:#64748b; font-weight:600;">
                    No hay documentos importados todavía.
                </td>
            </tr>
        `;
        countDocsText.textContent = '0 documentos';
        return;
    }

    statePre.documentos.forEach(doc => {
        const tr = document.createElement('tr');

        if (statePre.documentoActivo && Number(statePre.documentoActivo.id) === Number(doc.id)) {
            tr.classList.add('active');
        }

        tr.innerHTML = `
            <td>${doc.pre_entrada_compra || '<span style="color:#d97706;font-weight:700;">PRE pendiente</span>'}</td>
            <td>${doc.proveedor || '-'}</td>
            <td>${doc.referencia || '-'}</td>
            <td>${doc.fecha_documento || '-'}</td>
            <td>${doc.carga_tipo || '-'}</td>
            <td>${fmtTotal(doc)}</td>
            <td>${badgeEstado(doc.estado_revision)}</td>
            <td>
                <button class="btn-secondary btn-row-ver" data-id="${doc.id}">
                    Ver detalle
                </button>
            </td>
        `;

        const btnVer = tr.querySelector('.btn-row-ver');

        btnVer.addEventListener('click', async (e) => {
            e.stopPropagation();
            await cargarDetalleDocumento(doc.id);
        });

        tr.addEventListener('click', async () => {
            await cargarDetalleDocumento(doc.id);
        });

        tablaPreBody.appendChild(tr);
    });

    countDocsText.textContent = `${statePre.documentos.length} documento(s)`;
}

function setDetalle(doc, partidas) {
    statePre.documentoActivo = doc;

    estadoVacioDetalle.classList.add('hidden');
    detalleDocumento.classList.remove('hidden');

    document.getElementById('dPre').textContent = doc.pre_entrada_compra || 'PRE pendiente';
    document.getElementById('dProveedor').textContent = doc.proveedor || '-';
    document.getElementById('dReferencia').textContent = doc.referencia || '-';
    document.getElementById('dConcepto').textContent = doc.concepto || '-';
    document.getElementById('dEmpresa').textContent = doc.empresa || '-';
    document.getElementById('dFecha').textContent = doc.fecha_documento || '-';
    document.getElementById('dUnidadTipo').textContent = doc.unidad_tipo || '-';
    document.getElementById('dCargaTipo').textContent = doc.carga_tipo || '-';
    document.getElementById('dPalletsEntrada').textContent = doc.pallets_entrada || '-';
    document.getElementById('dTotalDescarga').textContent = fmtTotal(doc) || '-';
    document.getElementById('dObservaciones').textContent = doc.observaciones || '-';

    tablaDetalleBody.innerHTML = '';

    if (!partidas || !partidas.length) {
        tablaDetalleBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:18px; color:#64748b;">
                    No hay partidas para este documento.
                </td>
            </tr>
        `;
    } else {
        partidas.forEach(p => {
            const tr = document.createElement('tr');

            tr.innerHTML = `
                <td>${p.orden_linea || '-'}</td>
                <td>${p.almacen || '-'}</td>
                <td>${p.pallet_cama || '-'}</td>
                <td>${p.articulo || '-'}</td>
                <td>${p.codigo_auxiliar || '-'}</td>
                <td>${p.descripcion || '-'}</td>
                <td>${p.cantidad_esperada || 0}</td>
            `;

            tablaDetalleBody.appendChild(tr);
        });
    }

    renderListaDocumentos();
}

// =============================
// API CALLS
// =============================
async function cargarDocumentos() {
    try {
        const q = busquedaPre.value.trim();
        const estado = filtroEstadoPre.value;

        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (estado) params.set('estado', estado);

        const res = await fetch('/api/pre/documentos?' + params.toString());
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'No fue posible cargar documentos');
        }

        statePre.documentos = Array.isArray(data) ? data : [];
        renderListaDocumentos();

    } catch (error) {
        console.error(error);
        AzToast.error(error.message || 'Error al cargar documentos PRE.', {
            title: 'Error'
        });
    }
}

async function cargarDetalleDocumento(id) {
    try {
        const res = await fetch('/api/pre/documentos/' + encodeURIComponent(id));
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'No fue posible obtener el detalle');
        }

        setDetalle(data.documento, data.partidas || []);

    } catch (error) {
        console.error(error);
        AzToast.error(error.message || 'No fue posible cargar el detalle.', {
            title: 'Detalle'
        });
    }
}

async function importarExcel() {
    if (!archivoExcel.files.length) return;

    const formData = new FormData();
    formData.append('archivo', archivoExcel.files[0]);

    btnImportarExcel.disabled = true;
    btnImportarExcel.textContent = 'Importando...';

    try {
        const res = await fetch('/api/pre/importar-excel', {
            method: 'POST',
            body: formData
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'No fue posible importar el archivo');
        }

        setResumen(data);

        AzToast.success('Archivo importado correctamente.', {
            title: 'Importación exitosa'
        });

        await cargarDocumentos();

    } catch (error) {
        console.error(error);
        AzToast.error(error.message || 'No fue posible importar el archivo.', {
            title: 'Importación'
        });
    } finally {
        btnImportarExcel.disabled = false;
        btnImportarExcel.textContent = 'Importar archivo';
    }
}

async function guardarCorreccionPre() {
    if (!statePre.documentoActivo) return;

    const pre = inputCorregirPre.value.trim().toUpperCase();

    if (!pre) {
        AzToast.warning('Debes indicar un PRE válido.', {
            title: 'Folio requerido'
        });
        return;
    }

    try {
        const res = await fetch(`/api/pre/documentos/${encodeURIComponent(statePre.documentoActivo.id)}/corregir-pre`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pre_entrada_compra: pre })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'No fue posible corregir el PRE');
        }

        AzToast.success('Folio PRE corregido correctamente.', {
            title: 'Corrección guardada'
        });

        cerrarModal('modalCorregirPre');

        await cargarDocumentos();
        await cargarDetalleDocumento(statePre.documentoActivo.id);

    } catch (error) {
        console.error(error);
        AzToast.error(error.message || 'No se pudo guardar la corrección.', {
            title: 'Corrección'
        });
    }
}

async function cargarTurnosDisponibles() {
    try {
        const res = await fetch('/api/turnos');
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'No fue posible cargar turnos');
        }

        statePre.turnosDisponibles = (Array.isArray(data) ? data : []).filter(t =>
            ['En Espera', 'Proximo a Anden', 'En Descarga'].includes(t.estatus)
        );

        selectTurnoAsignar.innerHTML = '<option value="">Selecciona una unidad...</option>';

        statePre.turnosDisponibles.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = `${t.id} · ${t.proveedor || t.placas || 'Unidad'} · ${t.estatus}`;
            selectTurnoAsignar.appendChild(opt);
        });

    } catch (error) {
        console.error(error);
        AzToast.error(error.message || 'No fue posible cargar unidades.', {
            title: 'Turnos'
        });
    }
}

async function asignarDocumentoATurno() {
    if (!statePre.documentoActivo) return;

    const turnoId = Number(selectTurnoAsignar.value);

    if (!turnoId) {
        AzToast.warning('Debes seleccionar una unidad válida.', {
            title: 'Unidad requerida'
        });
        return;
    }

    try {
        const res = await fetch('/api/pre/asignar-a-turno', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                turno_id: turnoId,
                documentos: [statePre.documentoActivo.id]
            })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'No fue posible asignar el documento');
        }

        AzToast.success('Documento ligado a la unidad correctamente.', {
            title: 'Ligado documental'
        });

        cerrarModal('modalAsignarTurno');

        await cargarDocumentos();
        await cargarDetalleDocumento(statePre.documentoActivo.id);

    } catch (error) {
        console.error(error);
        AzToast.error(error.message || 'No fue posible asignar el documento.', {
            title: 'Asignación'
        });
    }
}

async function eliminarDocumentoPre() {
    if (!statePre.documentoActivo) return;

    const doc = statePre.documentoActivo;

    const confirmar = confirm(
        `¿Seguro que deseas eliminar este documento?\n\n` +
        `PRE: ${doc.pre_entrada_compra || 'PRE pendiente'}\n` +
        `Proveedor: ${doc.proveedor || '-'}\n\n` +
        `También se eliminarán sus partidas y cualquier relación con unidades.`
    );

    if (!confirmar) return;

    try {
        const res = await fetch(`/api/pre/documentos/${encodeURIComponent(doc.id)}`, {
            method: 'DELETE'
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'No fue posible eliminar el documento.');
        }

        AzToast.success('Documento eliminado correctamente.', {
            title: 'Eliminado'
        });

        resetDetalleDocumento();
        await cargarDocumentos();

    } catch (error) {
        console.error(error);
        AzToast.error(error.message || 'No fue posible eliminar el documento.', {
            title: 'Error al eliminar'
        });
    }
}

// =============================
// EVENTOS
// =============================
archivoExcel.addEventListener('change', () => {
    btnImportarExcel.disabled = !archivoExcel.files.length;
});

btnImportarExcel.addEventListener('click', importarExcel);
btnActualizarPre.addEventListener('click', cargarDocumentos);

let debounceTimer = null;
busquedaPre.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(cargarDocumentos, 250);
});

filtroEstadoPre.addEventListener('change', cargarDocumentos);

// Corregir PRE
if (btnEditarPre) {
    btnEditarPre.addEventListener('click', () => {
        if (!statePre.documentoActivo) return;
        inputCorregirPre.value = statePre.documentoActivo.pre_entrada_compra || '';
        abrirModal('modalCorregirPre');
    });
}

if (btnGuardarCorreccionPre) {
    btnGuardarCorreccionPre.addEventListener('click', guardarCorreccionPre);
}

// Asignar a turno
if (btnAsignarTurno) {
    btnAsignarTurno.addEventListener('click', async () => {
        if (!statePre.documentoActivo) return;
        await cargarTurnosDisponibles();
        abrirModal('modalAsignarTurno');
    });
}

if (btnConfirmarAsignacion) {
    btnConfirmarAsignacion.addEventListener('click', asignarDocumentoATurno);
}

// Eliminar documento
if (btnEliminarDocumentoPre) {
    btnEliminarDocumentoPre.addEventListener('click', eliminarDocumentoPre);
}

// Cerrar modales
document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => cerrarModal(btn.dataset.close));
});

document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

/* ===============================================================
PRE-IMPORT V5.0 - HISTORIAL + ESTADOS FRONTEND
Objetivo (modo pruebas / frontend-only):
- Reflejar en pre-import.html cambios de estado disparados desde admin modal
- Mostrar estados normalizados: importado / pendiente PRE / ligado / revisado / concluido
- Separar documentos activos e historial
- Ocultar de la vista activa los documentos concluidos
=============================================================== */

(function preImportV50Patch() {
  const KEY = 'azm_pre_estado_overrides_v1';
  const socket = (typeof io === 'function') ? io() : null;
  let vistaPreActual = 'activos';
  let intervaloRefresh = null;

  function leerOverridesPre() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function overrideDoc(doc) {
    const overrides = leerOverridesPre();
    return overrides[String(doc?.id)] || null;
  }

  function normalizarEstadoDoc(doc) {
    const ov = overrideDoc(doc);
    if (ov?.estado) return ov.estado;

    const estadoRevision = String(doc?.estado_revision || '').toLowerCase().trim();
    const estadoValidacion = String(doc?.estado_validacion || '').toLowerCase().trim();
    const turnoEstatus = String(doc?.turno_estatus || '').toLowerCase().trim();

    if (['concluido', 'finalizado', 'servicio_finalizado'].includes(estadoRevision)) return 'concluido';
    if (['concluido', 'finalizado', 'servicio_finalizado'].includes(estadoValidacion)) return 'concluido';
    if (turnoEstatus === 'finalizado') return 'concluido';

    if (['revisado', 'validado', 'cerrado', 'con_incidencias'].includes(estadoRevision)) return 'revisado';
    if (['revisado', 'validado', 'cerrado', 'con_incidencias'].includes(estadoValidacion)) return 'revisado';

    if (['ligado', 'en_validacion'].includes(estadoRevision)) return 'ligado';
    if (['ligado', 'en_validacion'].includes(estadoValidacion)) return 'ligado';
    if (doc?.turno_id) return 'ligado';

    if (estadoRevision === 'pendiente_pre') return 'pendiente_pre';
    if (!doc?.pre_entrada_compra) return 'pendiente_pre';

    return 'importado';
  }

  function badgeEstadoNormalizado(doc) {
    const estado = normalizarEstadoDoc(doc);
    const labels = {
      importado: 'Importado',
      pendiente_pre: 'Pendiente PRE',
      ligado: 'Ligado',
      revisado: 'Revisado',
      concluido: 'Concluido'
    };
    return labels[estado] || estado;
  }

  function docsSegunVista(documentos) {
    const docs = Array.isArray(documentos) ? documentos : [];
    return docs.filter(doc => {
      const estadoNormalizado = normalizarEstadoDoc(doc);
      if (vistaPreActual === 'historial') {
        return estadoNormalizado === 'concluido';
      }
      return estadoNormalizado !== 'concluido';
    });
  }

  function inyectarTabsHistorial() {
    if (document.getElementById('preViewSwitcher')) return;
    const toolbar = document.querySelector('.toolbar-pre');
    if (!toolbar) return;

    const wrap = document.createElement('div');
    wrap.id = 'preViewSwitcher';
    wrap.style.display = 'flex';
    wrap.style.gap = '10px';
    wrap.style.alignItems = 'center';
    wrap.style.marginTop = '10px';
    wrap.innerHTML = `
      <button type="button" id="btnVistaPreActivos" class="btn-secondary">Activos</button>
      <button type="button" id="btnVistaPreHistorial" class="btn-secondary">Historial</button>
      <span id="preViewHint" style="font-size:12px; color:#64748b; font-weight:600;"></span>
    `;
    toolbar.insertAdjacentElement('afterend', wrap);

    document.getElementById('btnVistaPreActivos')?.addEventListener('click', () => {
      vistaPreActual = 'activos';
      renderListaDocumentos();
    });

    document.getElementById('btnVistaPreHistorial')?.addEventListener('click', () => {
      vistaPreActual = 'historial';
      renderListaDocumentos();
    });
  }

  const renderListaOriginal = typeof renderListaDocumentos === 'function' ? renderListaDocumentos : null;
  const setDetalleOriginal = typeof setDetalle === 'function' ? setDetalle : null;

  if (typeof badgeEstado === 'function') {
    badgeEstado = function(estado) {
      const key = String(estado || '').replace('_', ' ');
      return key || 'importado';
    };
  }

  renderListaDocumentos = function renderListaDocumentosV50() {
    limpiarTablaDocumentos();
    const docsVisibles = docsSegunVista(statePre.documentos);

    const hint = document.getElementById('preViewHint');
    if (hint) {
      const activos = statePre.documentos.filter(d => normalizarEstadoDoc(d) !== 'concluido').length;
      const historial = statePre.documentos.filter(d => normalizarEstadoDoc(d) === 'concluido').length;
      hint.textContent = `Activos: ${activos} · Historial: ${historial}`;
    }

    if (!docsVisibles.length) {
      tablaPreBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; padding:22px; color:#64748b; font-weight:600;">
            ${vistaPreActual === 'historial' ? 'No hay documentos concluidos todavía.' : 'No hay documentos activos todavía.'}
          </td>
        </tr>
      `;
      countDocsText.textContent = `0 documento(s)`;
      if (vistaPreActual === 'activos' && statePre.documentoActivo && normalizarEstadoDoc(statePre.documentoActivo) === 'concluido') {
        resetDetalleDocumento();
      }
      return;
    }

    docsVisibles.forEach(doc => {
      const tr = document.createElement('tr');
      if (statePre.documentoActivo && Number(statePre.documentoActivo.id) === Number(doc.id)) {
        tr.classList.add('active');
      }

      const estadoNormalizado = normalizarEstadoDoc(doc);
      tr.innerHTML = `
        <td>${doc.pre_entrada_compra || 'PRE pendiente'}</td>
        <td>${doc.proveedor || '-'}</td>
        <td>${doc.referencia || '-'}</td>
        <td>${doc.fecha_documento || '-'}</td>
        <td>${doc.carga_tipo || '-'}</td>
        <td>${fmtTotal(doc)}</td>
        <td>${badgeEstadoNormalizado(doc)}</td>
        <td><button class="btn-row-ver">Ver detalle</button></td>
      `;

      const btnVer = tr.querySelector('.btn-row-ver');
      btnVer.addEventListener('click', async (e) => {
        e.stopPropagation();
        await cargarDetalleDocumento(doc.id);
      });
      tr.addEventListener('click', async () => {
        await cargarDetalleDocumento(doc.id);
      });
      tablaPreBody.appendChild(tr);
    });

    countDocsText.textContent = `${docsVisibles.length} documento(s)`;
  };

  setDetalle = function setDetalleV50(doc, partidas) {
    if (setDetalleOriginal) setDetalleOriginal(doc, partidas);
    const hint = document.getElementById('detalleHint');
    if (hint && doc) {
      hint.textContent = `Estado: ${badgeEstadoNormalizado(doc)}`;
    }
  };

  function iniciarRefreshAutomatico() {
    if (intervaloRefresh) clearInterval(intervaloRefresh);
    intervaloRefresh = setInterval(() => {
      if (typeof cargarDocumentos === 'function') cargarDocumentos();
    }, 15000);
  }

  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      if (typeof cargarDocumentos === 'function') cargarDocumentos();
    }
  });

  if (socket) {
    socket.on('actualizacion_turnos', () => {
      if (typeof cargarDocumentos === 'function') cargarDocumentos();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    inyectarTabsHistorial();
    iniciarRefreshAutomatico();
    setTimeout(() => {
      if (typeof cargarDocumentos === 'function') cargarDocumentos();
    }, 200);
  });

  console.info('PRE-IMPORT V5.0 historial + estados frontend cargado');
})();


// =============================
// INICIALIZACIÓN
// =============================
document.addEventListener('DOMContentLoaded', async () => {
    await cargarDocumentos();
});