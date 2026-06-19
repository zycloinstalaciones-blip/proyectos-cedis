/* ===============================================================
ADMIN UNIFICADO
Construido a partir de la lógica original admin.js + ajustes V4.1 → V4.6
Fuente base utilizada: reconstructed_from_uploaded_logic
Incluye:
- Panel Patio / Historial
- Modal PRE completo
- Escáner con modo pieza / master / pallet
- PALLET/CAMA en SKU
- Memoria local de piezas por caja master
=============================================================== */

const socket = io();

let listaTurnosLocal = [];
let historialGlobal = [];
let idsPrevios = new Set();

const estadoPreTurno = {
  turnoActivo: null,
  documentosLigados: [],
  documentoActivo: null,
  resultadosBusqueda: [],
  modoValidacion: false,
  turnoPreDocumentoId: null,
  lineasValidacion: [],
  incidenciaPendiente: null
};

const estadoScanPre = {
  historialEscaneos: [],
  masterPorSku: JSON.parse(localStorage.getItem('pre_master_por_sku') || '{}')
};

if (!window.AzUI) console.error('AzUI no está disponible. Verifica que /js/shared-ui-config.js cargue antes que admin.js');
if (!window.AzStatus) console.error('AzStatus no está disponible. Verifica que /js/shared-status-config.js cargue antes que admin.js');

// ================= NAVEGACIÓN DE PESTAÑAS =================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => { c.style.display = 'none'; });
    btn.classList.add('active');
    const tabDestino = document.getElementById(`tab-${btn.dataset.tab}`);
    if (tabDestino) tabDestino.style.display = ['tab-patio', 'tab-historial'].includes(tabDestino.id) ? 'grid' : 'block';
  });
});

document.querySelectorAll('.pre-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pre-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.pre-tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const targetId = btn.getAttribute('data-target');
    const panel = document.getElementById(targetId);
    if (panel) panel.classList.add('active');
  });
});

// ================= HELPERS =================
function obtenerFechaSegura(fecha) {
  if (!fecha) return null;
  const parsed = new Date(String(fecha).replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function normalizarEstatusTurno(estatus) { return String(estatus || '').trim().toLowerCase(); }
function obtenerFechaVisibleAdmin(turno) {
  const estatus = normalizarEstatusTurno(turno.estatus);
  if (estatus === 'programado') return turno.hora_cita || turno.hora_llegada || '';
  return turno.hora_llegada || turno.hora_cita || '';
}
function puedeLlamarAAnden(turno) { return normalizarEstatusTurno(turno.estatus).startsWith('en espera'); }
function puedeIniciarDescarga(turno) { return normalizarEstatusTurno(turno.estatus).startsWith('proximo a anden'); }
function estaEnDescarga(turno) { return normalizarEstatusTurno(turno.estatus).startsWith('en descarga'); }
function formatearTiempoHumano(minutosTotales) {
  const minutos = Math.max(Number(minutosTotales) || 0, 0);
  if (minutos < 60) return `${minutos}m`;
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const mins = minutos % 60;
  if (dias > 0) return `${dias}d ${horas}h`;
  if (horas > 0) return mins > 0 ? `${horas}h ${mins}m` : `${horas}h`;
  return `${minutos}m`;
}
function obtenerMinutosEspera(turno) {
  const fecha = obtenerFechaVisibleAdmin(turno);
  if (!fecha) return '0m';
  const inicio = obtenerFechaSegura(fecha);
  if (!inicio) return '0m';
  return formatearTiempoHumano(Math.floor((new Date() - inicio) / 60000));
}
function escaparHTML(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function normalizarListaTexto(valor) {
  if (Array.isArray(valor)) {
    return valor.map(v => String(v || '').trim()).filter(Boolean);
  }

  if (valor == null) return [];

  if (typeof valor === 'object') {
    const posibles = ['folio', 'factura', 'entrada', 'pre_entrada', 'numero', 'referencia'];
    return posibles
      .map(k => valor[k])
      .filter(Boolean)
      .map(v => String(v).trim())
      .filter(Boolean);
  }

  const str = String(valor).trim();
  if (!str) return [];

  if (str.startsWith('[') && str.endsWith(']')) {
    try {
      const parsed = JSON.parse(str);
      return normalizarListaTexto(parsed);
    } catch (e) {
      // Si no es JSON válido, sigue con split normal
    }
  }

  return str
    .split(/[;,|\n]+/)
    .map(v => String(v || '').trim())
    .filter(Boolean);
}

function obtenerEntradasAsignadas(turno) {
  const candidatos = [
    turno?.entradas_asignadas,
    turno?.entradasAsignadas,
    turno?.facturas_asignadas,
    turno?.facturasAsignadas,
    turno?.folios_asignados,
    turno?.foliosAsignados,
    turno?.facturas,
    turno?.entradas,
    turno?.pre_entradas,
    turno?.preEntradas,
    turno?.folios,
    turno?.folio
  ];

  for (const candidato of candidatos) {
    const lista = normalizarListaTexto(candidato);
    if (lista.length) return lista;
  }

  return [];
}

function renderEntradasAsignadas(turno) {
  const entradas = obtenerEntradasAsignadas(turno);
  const total = entradas.length;

  if (total <= 0) {
    return {
      label: 'Folio:',
      html: '<span>-</span>'
    };
  }

  if (total === 1) {
    return {
      label: 'Folio:',
      html: `<span>${escaparHTML(entradas[0])}</span>`
    };
  }

  const tooltip = escaparHTML(entradas.join('\n'));
  return {
    label: 'Folio:',
    html: `<div class="tooltip-folios" data-folios="${tooltip}">(${total}) <span class="icono-ayuda">?</span></div>`
  };
}
function preSetText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
function preNormalizarIncidencia(tipo) { return String(tipo || '').replace(/_/g, ' ').trim(); }
function normalizarCodigoScan(valor) { return String(valor || '').trim().toUpperCase().replace(/\s+/g, ''); }
function badgeEstadoValidacion(estado) {
  const key = estado || 'ligado';
  return `<span class="badge-validacion estado-${key}">${String(key).replace('_', ' ')}</span>`;
}

// ================= PRE V4.6 CONSOLIDADO =================
function preEstadoLinea(esperado, recibido, incidenciaTipo) {
  const esp = Number(esperado || 0);
  const rec = Number(recibido || 0);
  const incidencia = String(incidenciaTipo || '').trim();
  if (incidencia) return 'error';
  if (rec === 0) return 'pending';
  if (rec < esp) return 'partial';
  if (rec >= esp && esp > 0) return 'ok';
  return 'pending';
}
function preModoLabel(modo) { return ({ pieza: 'Pieza', master: 'Caja master', pallet: 'Pallet' })[modo] || 'Pieza'; }
function preGuardarMasterSku(articulo, qty) {
  if (!articulo || !qty || qty <= 0) return;
  estadoScanPre.masterPorSku[String(articulo).toUpperCase()] = Number(qty);
  localStorage.setItem('pre_master_por_sku', JSON.stringify(estadoScanPre.masterPorSku));
}
function preObtenerMasterSku(articulo) { return articulo ? (estadoScanPre.masterPorSku[String(articulo).toUpperCase()] || null) : null; }
function preParsePalletCama(linea) {
  const candidatos = [
    linea?.pallet_cama,
    linea?.['pallet/cama'],
    linea?.['PALLET/CAMA'],
    linea?.palletCama,
    linea?.pallet_cama_texto,
    linea?.palletCamaTexto
  ];
  for (const val of candidatos) {
    if (val == null) continue;
    const str = String(val).trim();
    if (!str) continue;
    const m = str.match(/^(\d+(?:\.\d+)?)/);
    if (m) {
      const n = Number(m[1]);
      if (!Number.isNaN(n) && n > 0) return { cantidad: n, raw: str, fuente: 'PALLET/CAMA', fallback: false };
    }
    const n2 = Number(str);
    if (!Number.isNaN(n2) && n2 > 0) return { cantidad: n2, raw: str, fuente: 'PALLET/CAMA', fallback: false };
  }
  return { cantidad: 1, raw: '', fuente: 'sin_equivalencia', fallback: true };
}
function prePalletRaw(linea) { return preParsePalletCama(linea).raw || ''; }
function preBadgePallet(raw) {
  return raw
    ? `<span class="pre-pallet-badge configured">${escaparHTML(raw)}</span>`
    : `<span class="pre-pallet-badge empty">Sin dato</span>`;
}
function preResolverCantidad(linea, modo) {
  if (modo === 'pieza') return { cantidad: 1, fallback: false, fuente: 'pieza' };
  if (modo === 'master') {
    const qty = Number(document.getElementById('scanPreMasterPzas')?.value || 0);
    if (!Number.isNaN(qty) && qty > 0) return { cantidad: qty, fallback: false, fuente: 'master_manual' };
    return { cantidad: 0, fallback: true, fuente: 'master_manual_invalido' };
  }
  return preParsePalletCama(linea);
}
function preActualizarAyudaModo() {
  const select = document.getElementById('scanPreModoConteo');
  const ayuda = document.getElementById('preScanModoAyuda');
  const wrap = document.getElementById('scanPreMasterWrap');
  if (!select || !ayuda || !wrap) return;
  const modo = select.value || 'pieza';
  ayuda.classList.remove('warn', 'ok');
  if (modo === 'pieza') {
    ayuda.textContent = 'Modo: pieza (suma 1)';
    ayuda.classList.add('ok');
  } else if (modo === 'master') {
    ayuda.textContent = 'Modo: caja master (usa las pzas capturadas manualmente)';
    ayuda.classList.add('ok');
  } else {
    ayuda.textContent = 'Modo: pallet (usa el total general de PALLET/CAMA)';
    ayuda.classList.add('ok');
  }
  wrap.classList.toggle('hidden', modo !== 'master');
  preAutocompletarMasterDesdeCodigo();
}
function encontrarLineaPorCodigoEscaneado(codigo) {
  const codigoNormalizado = normalizarCodigoScan(codigo);
  const lineas = estadoPreTurno.lineasValidacion || [];
  if (!codigoNormalizado || !lineas.length) return null;
  return lineas.find(l => normalizarCodigoScan(l.codigo_auxiliar) === codigoNormalizado)
      || lineas.find(l => normalizarCodigoScan(l.articulo) === codigoNormalizado)
      || null;
}
function preAutocompletarMasterDesdeCodigo() {
  const select = document.getElementById('scanPreModoConteo');
  if (!select || select.value !== 'master') return;
  const inputCodigo = document.getElementById('scanPreInput');
  const inputMaster = document.getElementById('scanPreMasterPzas');
  if (!inputCodigo || !inputMaster) return;
  const codigo = String(inputCodigo.value || '').trim().toUpperCase();
  if (!codigo) return;
  const linea = encontrarLineaPorCodigoEscaneado(codigo);
  if (!linea) return;
  const sugerido = preObtenerMasterSku(linea.articulo);
  inputMaster.classList.remove('prefilled');
  if (sugerido) { inputMaster.value = sugerido; inputMaster.classList.add('prefilled'); }
}
function mostrarResultadoScanPre(texto, tipo = '') {
  const box = document.getElementById('scanPreUltimoResultado');
  if (!box) return;
  box.className = 'pre-scan-result';
  if (tipo === 'ok') box.classList.add('ok');
  if (tipo === 'error') box.classList.add('error');
  box.textContent = texto;
}
function preRenderScanFeed() {
  const contenedor = document.getElementById('preScanFeed');
  if (!contenedor) return;
  contenedor.innerHTML = '';
  if (!estadoScanPre.historialEscaneos.length) {
    contenedor.innerHTML = '<div class="empty-state-mini">Aún no hay lecturas registradas en esta sesión.</div>';
    return;
  }
  [...estadoScanPre.historialEscaneos].reverse().slice(0, 30).forEach(item => {
    const row = document.createElement('div');
    row.className = `pre-scan-item ${item.estado || 'pending'}`;
    row.innerHTML = `
      <div class="pre-scan-item-main">
        <div class="pre-scan-item-sku">${escaparHTML(item.articulo || '-')}</div>
        <div class="pre-scan-item-desc">${escaparHTML(item.descripcion || 'Artículo escaneado')}</div>
        <div class="pre-scan-item-meta">${escaparHTML(item.timestamp || '')}</div>
      </div>
      <div class="pre-scan-item-side">
        <span class="pre-scan-item-caption">Recibido / Esperado</span>
        <span class="pre-scan-item-count">${item.recibido || 0} / ${item.esperado || 0}</span>
      </div>
    `;
    const badges = document.createElement('div');
    badges.className = 'pre-scan-item-badges';
    const bModo = document.createElement('span'); bModo.className = 'pre-scan-badge mode'; bModo.textContent = preModoLabel(item.modo || 'pieza'); badges.appendChild(bModo);
    const bQty = document.createElement('span'); bQty.className = 'pre-scan-badge qty'; bQty.textContent = `+${item.cantidadSumada || 1}`; badges.appendChild(bQty);
    const bSrc = document.createElement('span'); bSrc.className = 'pre-scan-badge source'; bSrc.textContent = item.modo === 'master' ? 'Master manual' : item.modo === 'pallet' ? (item.fuenteExtra || 'PALLET/CAMA') : 'Pieza'; badges.appendChild(bSrc);
    if (item.fallback) {
      const bFall = document.createElement('span'); bFall.className = 'pre-scan-badge fallback'; bFall.textContent = item.modo === 'pallet' ? 'PALLET/CAMA no configurado' : 'Master manual inválido'; badges.appendChild(bFall);
    }
    row.querySelector('.pre-scan-item-main')?.appendChild(badges);
    contenedor.appendChild(row);
  });
}
function preRenderIncidencias() {
  const contenedor = document.getElementById('preIncidenciasLista');
  if (!contenedor) return;
  const lineas = estadoPreTurno.lineasValidacion || [];
  const incidencias = lineas.filter(l => String(l.incidencia_tipo || '').trim());
  contenedor.innerHTML = '';
  if (!incidencias.length) {
    contenedor.innerHTML = '<div class="empty-state-mini">No hay incidencias registradas para este PRE.</div>';
    return;
  }
  incidencias.forEach(linea => {
    const item = document.createElement('div');
    item.className = 'pre-incidencia-item';
    item.innerHTML = `
      <div>
        <div class="pre-incidencia-head">
          <span class="pre-incidencia-tipo">${escaparHTML(preNormalizarIncidencia(linea.incidencia_tipo))}</span>
          <span class="pre-incidencia-articulo">${escaparHTML(linea.articulo || '-')}</span>
        </div>
        <div class="pre-incidencia-observacion">${escaparHTML(linea.incidencia_observacion || linea.descripcion || 'Sin observación capturada')}</div>
      </div>
      <div class="pre-incidencia-cantidad">${linea.cantidad_recibida || 0} / ${linea.cantidad_esperada || 0}</div>`;
    contenedor.appendChild(item);
  });
}

function preSyncIncidenciaKpis() {
  const doc = estadoPreTurno.documentoActivo || {};
  const lineas = estadoPreTurno.lineasValidacion || [];

  let esperado = Number(doc.total_esperado || 0);
  let recibido = Number(doc.total_recibido || 0);
  let totalIncidencias = 0;

  // Si hay líneas cargadas, calcula desde las líneas (más confiable en validación)
  if (lineas.length) {
    esperado = lineas.reduce((acc, l) => acc + Number(l.cantidad_esperada || 0), 0);
    recibido = lineas.reduce((acc, l) => acc + Number(l.cantidad_recibida || 0), 0);
    totalIncidencias = lineas.filter(l => String(l.incidencia_tipo || '').trim()).length;
  } else {
    totalIncidencias = doc.tiene_incidencias ? 1 : 0;
  }

  preSetText('preIncResumenEsperado', esperado);
  preSetText('preIncResumenRecibido', recibido);
  preSetText('preIncResumenTotal', totalIncidencias > 0 ? `Sí (${totalIncidencias})` : 'No');
}

function preSyncScanProgress() {
  const doc = estadoPreTurno.documentoActivo || {};
  const lineas = estadoPreTurno.lineasValidacion || [];

  let esperado = Number(doc.total_esperado || 0);
  let recibido = Number(doc.total_recibido || 0);

  if (lineas.length) {
    esperado = lineas.reduce((acc, l) => acc + Number(l.cantidad_esperada || 0), 0);
    recibido = lineas.reduce((acc, l) => acc + Number(l.cantidad_recibida || 0), 0);
  }

  preSetText('preScanProgresoChip', `${recibido} / ${esperado} Pzas`);

  const proveedor = doc.proveedor || document.getElementById('preDocProveedor')?.textContent || 'PRE activo';
  preSetText('preScanProveedorChip', proveedor);
}


function resetHeroPreDocumento() {
  preSetText('preHeroFolio', 'Selecciona un PRE');
  preSetText('preHeroMeta', 'Aquí verás proveedor, referencia y fecha del documento seleccionado.');
  const estado = document.getElementById('preDocEstadoValidacion');
  if (estado) { estado.className = 'badge-validacion estado-ligado'; estado.textContent = 'ligado'; }
  preSetText('preResumenEsperado', '0'); preSetText('preResumenRecibido', '0'); preSetText('preResumenIncidencias', 'No');
  preSetText('preIncResumenEsperado', '0'); preSetText('preIncResumenRecibido', '0'); preSetText('preIncResumenTotal', 'No');
  preSetText('preIncFolio', 'Selecciona un PRE'); preSetText('preIncMeta', 'Aquí verás el contexto del documento para revisar incidencias.');
  preSetText('preIncProveedor', '-'); preSetText('preIncReferencia', '-'); preSetText('preIncFecha', '-'); preSetText('preIncEstadoTexto', '-');
  const incEstado = document.getElementById('preIncEstado');
  if (incEstado) { incEstado.className = 'badge-validacion estado-ligado'; incEstado.textContent = 'ligado'; }
  preSetText('preScanProveedorChip', 'PRE activo'); preSetText('preScanProgresoChip', '0 / 0 Pzas');
  if (document.getElementById('preSkusVacio')) document.getElementById('preSkusVacio').classList.remove('hidden');
  if (document.getElementById('preSkusContenido')) document.getElementById('preSkusContenido').classList.add('hidden');
  estadoScanPre.historialEscaneos = [];
  const body = document.getElementById('tablaPreDetalleAdminBody'); if (body) body.innerHTML = '';
  preRenderScanFeed(); preRenderIncidencias();
}
function pintarHeroPreDocumento(documento) {
  if (!documento) { resetHeroPreDocumento(); return; }
  const folio = documento.pre_entrada_compra || 'PRE pendiente';
  const proveedor = documento.proveedor || '-';
  const referencia = documento.referencia || '-';
  const fecha = documento.fecha_documento || '-';
  const key = documento.estado_validacion || 'ligado';
  const estadoTexto = String(key).replace('_', ' ');
  preSetText('preHeroFolio', folio); preSetText('preHeroMeta', `${proveedor} · Ref. ${referencia} · ${fecha}`);
  const estado = document.getElementById('preDocEstadoValidacion'); if (estado) { estado.className = `badge-validacion estado-${key}`; estado.textContent = estadoTexto; }
  preSetText('preIncFolio', folio); preSetText('preIncMeta', `${proveedor} · Ref. ${referencia} · ${fecha}`);
  preSetText('preIncProveedor', proveedor); preSetText('preIncReferencia', referencia); preSetText('preIncFecha', fecha); preSetText('preIncEstadoTexto', estadoTexto);
  const incEstado = document.getElementById('preIncEstado'); if (incEstado) { incEstado.className = `badge-validacion estado-${key}`; incEstado.textContent = estadoTexto; }
  preSetText('preScanProveedorChip', proveedor || 'PRE activo');
  preSyncScanProgress(); preSyncIncidenciaKpis();
}
function abrirModalPreTurno(turnoId) {
  const turno = listaTurnosLocal.find(t => Number(t.id) === Number(turnoId));
  if (!turno) { AzToast.warning('No se encontró la unidad seleccionada.', { title: 'Unidad' }); return; }
  estadoPreTurno.turnoActivo = turno; estadoPreTurno.documentoActivo = null;
  const meta = document.getElementById('preTurnoMeta'); if (meta) meta.innerText = `${turno.proveedor || '-'} | ${turno.placas || '-'} | Andén ${turno.anden || '-'}`;
  document.getElementById('modalPreTurno')?.classList.add('active'); document.body.classList.add('modal-open');
  document.getElementById('panelAsignacionPre')?.classList.add('hidden');
  const buscarInput = document.getElementById('buscarDocumentoPreAdmin'); if (buscarInput) buscarInput.value = '';
  const resultados = document.getElementById('resultadosBusquedaPreAdmin'); if (resultados) resultados.innerHTML = `<div class="empty-state-mini">Escribe para buscar documentos importados.</div>`;
  resetHeroPreDocumento(); resetDetallePreTurno(); cargarPreLigadosTurno(turno.id); preActualizarAyudaModo();
}
function cerrarModalPreTurno() {
  document.getElementById('modalPreTurno')?.classList.remove('active'); document.body.classList.remove('modal-open');
  estadoPreTurno.turnoActivo = null; estadoPreTurno.documentoActivo = null; estadoPreTurno.documentosLigados = []; estadoPreTurno.lineasValidacion = [];
  resetHeroPreDocumento();
}
function resetDetallePreTurno() {
  const body = document.getElementById('tablaPreDetalleAdminBody'); if (body) body.innerHTML = '';
  if (document.getElementById('preSkusVacio')) document.getElementById('preSkusVacio').classList.remove('hidden');
  if (document.getElementById('preSkusContenido')) document.getElementById('preSkusContenido').classList.add('hidden');
}
function pintarEncabezadoPreDocumento(documento) {
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  setText('preDocFolio', documento.pre_entrada_compra || 'PRE pendiente');
  setText('preDocProveedor', documento.proveedor || '-');
  setText('preDocReferencia', documento.referencia || '-');
  setText('preDocConcepto', documento.concepto || '-');
  setText('preDocFecha', documento.fecha_documento || '-');
  setText('preDocCarga', documento.carga_tipo || '-');
  setText('preDocTotal', `${documento.total_descarga || '-'} ${documento.unidad_total_descarga || ''}`.trim());
  setText('preDocObservaciones', documento.observaciones || '-');
  preSetText('preResumenEsperado', documento.total_esperado != null ? documento.total_esperado : '-');
  preSetText('preResumenRecibido', documento.total_recibido != null ? documento.total_recibido : '-');
  preSetText('preResumenIncidencias', documento.tiene_incidencias ? 'Sí' : 'No');
  pintarHeroPreDocumento(documento);
  const btnIniciar = document.getElementById('btnIniciarValidacionPre');
  const btnCerrar = document.getElementById('btnCerrarValidacionPre');
  if (btnIniciar) btnIniciar.style.display = ['ligado', '', null, undefined].includes(documento.estado_validacion) ? 'inline-flex' : 'none';
  if (btnCerrar) btnCerrar.style.display = ['en_validacion', 'validado', 'con_incidencias'].includes(documento.estado_validacion) ? 'inline-flex' : 'none';
  const bloqueEscaneo = document.getElementById('bloqueEscaneoPre'); if (bloqueEscaneo) bloqueEscaneo.classList.toggle('hidden', !['en_validacion', 'validado', 'con_incidencias'].includes(documento.estado_validacion));
}
function renderTablaPreModoLectura(partidas) {
  const body = document.getElementById('tablaPreDetalleAdminBody');
  if (!body) return;
  body.innerHTML = '';
  if (!partidas || !partidas.length) {
    document.getElementById('preSkusVacio')?.classList.remove('hidden');
    document.getElementById('preSkusContenido')?.classList.add('hidden');
    return;
  }
  document.getElementById('preSkusVacio')?.classList.add('hidden');
  document.getElementById('preSkusContenido')?.classList.remove('hidden');
  partidas.forEach(p => {
    const palletRaw = prePalletRaw(p);
    const palletBadge = preBadgePallet(palletRaw);
    const masterSugerido = preObtenerMasterSku(p.articulo);
    const notaMaster = masterSugerido ? `<span class="pre-sku-master-note">Master sugerido: ${masterSugerido}</span>` : '';
    body.innerHTML += `
      <tr>
        <td>${escaparHTML(p.orden_linea || '-')}</td>
        <td>${escaparHTML(p.articulo || '-')} ${notaMaster}</td>
        <td>${escaparHTML(p.descripcion || '-')}</td>
        <td>${palletBadge}</td>
        <td>${escaparHTML(p.cantidad_esperada || 0)}</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td><span style="color:#64748b; font-size:0.76rem;">Inicia validación</span></td>
      </tr>`;
  });
}
function obtenerEstadoLineaPreview(esperado, recibido, incidenciaTipo) {
  const esp = Number(esperado || 0); const rec = Number(recibido || 0); const incidencia = String(incidenciaTipo || '').trim();
  if (incidencia) return 'con_incidencia'; if (rec === 0) return 'pendiente'; if (rec < esp) return 'parcial'; if (rec === esp) return 'validada'; if (rec > esp) return 'con_incidencia'; return 'pendiente';
}
function aplicarEstiloFilaPre(tr, estado) {
  if (!tr) return; tr.style.background=''; tr.style.borderLeft=''; tr.style.transition='background 0.2s ease, border-left 0.2s ease';
  if (estado === 'pendiente') { tr.style.background = '#f8fafc'; tr.style.borderLeft = '4px solid #cbd5e1'; }
  if (estado === 'parcial') { tr.style.background = '#eff6ff'; tr.style.borderLeft = '4px solid #3b82f6'; }
  if (estado === 'validada') { tr.style.background = '#f0fdf4'; tr.style.borderLeft = '4px solid #16a34a'; }
  if (estado === 'con_incidencia') { tr.style.background = '#fff7ed'; tr.style.borderLeft = '4px solid #f97316'; }
}
function actualizarPreviewLineaPre(lineaId, cantidadEsperada) {
  const inputRecibido = document.getElementById(`recibido_${lineaId}`); const selectIncidencia = document.getElementById(`incidencia_${lineaId}`); const diffCell = document.getElementById(`diff_${lineaId}`); const estadoChip = document.getElementById(`estado_preview_${lineaId}`); const fila = document.getElementById(`fila_pre_${lineaId}`); if (!inputRecibido || !selectIncidencia || !diffCell || !fila) return;
  const esperado = Number(cantidadEsperada || 0); const recibido = Number(inputRecibido.value || 0); const diferencia = recibido - esperado; diffCell.textContent = diferencia;
  const incidenciasManuales = ['material_cambiado','danado','rechazado','devolucion_compra'];
  if (!incidenciasManuales.includes(selectIncidencia.value)) {
    if (diferencia < 0) selectIncidencia.value = 'faltante';
    else if (diferencia > 0) selectIncidencia.value = 'sobrante';
    else if (['faltante','sobrante'].includes(selectIncidencia.value)) selectIncidencia.value = '';
  }
  const estado = obtenerEstadoLineaPreview(esperado, recibido, selectIncidencia.value);
  if (estadoChip) estadoChip.textContent = ({pendiente:'Pendiente', parcial:'Parcial', validada:'Validada', con_incidencia:'Con incidencia'})[estado] || estado;
  diffCell.style.fontWeight='700'; diffCell.style.color = diferencia < 0 ? '#dc2626' : diferencia > 0 ? '#d97706' : '#16a34a';
  aplicarEstiloFilaPre(fila, estado); recalcularResumenPreviewPre();
}
function recalcularResumenPreviewPre() {
  const filas = document.querySelectorAll('#tablaPreDetalleAdminBody tr[data-linea-pre="1"]'); let totalEsperado = 0, totalRecibido = 0, totalIncidencias = 0;
  filas.forEach(tr => {
    const esperado = Number(tr.dataset.esperado || 0); const lineaId = tr.dataset.lineaId; const recibido = Number(document.getElementById(`recibido_${lineaId}`)?.value || 0); const incidencia = String(document.getElementById(`incidencia_${lineaId}`)?.value || '').trim();
    totalEsperado += esperado; totalRecibido += recibido; if (incidencia) totalIncidencias++;
  });
  preSetText('preResumenEsperado', totalEsperado); preSetText('preResumenRecibido', totalRecibido); preSetText('preResumenIncidencias', totalIncidencias > 0 ? `Sí (${totalIncidencias})` : 'No');
  preSyncIncidenciaKpis(); preSyncScanProgress(); preRenderIncidencias();
}
function renderTablaPreValidacion(partidas) {
  const body = document.getElementById('tablaPreDetalleAdminBody');
  if (!body) return; body.innerHTML = '';
  if (!partidas || !partidas.length) { document.getElementById('preSkusVacio')?.classList.remove('hidden'); document.getElementById('preSkusContenido')?.classList.add('hidden'); return; }
  document.getElementById('preSkusVacio')?.classList.add('hidden'); document.getElementById('preSkusContenido')?.classList.remove('hidden');
  partidas.forEach(p => {
    const incidenciaActual = p.incidencia_tipo || ''; const diferencia = Number(p.diferencia || 0); const esperado = Number(p.cantidad_esperada || 0); const recibido = Number(p.cantidad_recibida || 0); const estadoPreview = obtenerEstadoLineaPreview(esperado, recibido, incidenciaActual); const palletRaw = prePalletRaw(p); const palletBadge = preBadgePallet(palletRaw); const masterSugerido = preObtenerMasterSku(p.articulo); const notaMaster = masterSugerido ? `<span class="pre-sku-master-note">Master sugerido: ${masterSugerido}</span>` : '';
    const tr = document.createElement('tr'); tr.id = `fila_pre_${p.id}`; tr.dataset.lineaPre = '1'; tr.dataset.lineaId = p.id; tr.dataset.esperado = esperado;
    tr.innerHTML = `
      <td><div style="display:flex; flex-direction:column; gap:4px;"><span>${escaparHTML(p.orden_linea || '-')}</span><span id="estado_preview_${p.id}" style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:0.68rem;font-weight:700;background:#e2e8f0;color:#334155;width:max-content;">${estadoPreview === 'pendiente' ? 'Pendiente' : estadoPreview === 'parcial' ? 'Parcial' : estadoPreview === 'validada' ? 'Validada' : 'Con incidencia'}</span></div></td>
      <td>${escaparHTML(p.articulo || '-')} ${notaMaster}</td>
      <td>${escaparHTML(p.descripcion || '-')}</td>
      <td>${palletBadge}</td>
      <td>${esperado}</td>
      <td><input type="number" min="0" step="1" id="recibido_${p.id}" class="input-mini-pre" value="${recibido}"></td>
      <td id="diff_${p.id}">${diferencia}</td>
      <td>
        <select id="incidencia_${p.id}" class="select-mini-pre">
          <option value="">Sin incidencia</option>
          <option value="faltante" ${incidenciaActual === 'faltante' ? 'selected' : ''}>Faltante</option>
          <option value="sobrante" ${incidenciaActual === 'sobrante' ? 'selected' : ''}>Sobrante</option>
          <option value="material_cambiado" ${incidenciaActual === 'material_cambiado' ? 'selected' : ''}>Material cambiado</option>
          <option value="danado" ${incidenciaActual === 'danado' ? 'selected' : ''}>Dañado</option>
          <option value="rechazado" ${incidenciaActual === 'rechazado' ? 'selected' : ''}>Rechazado</option>
          <option value="devolucion_compra" ${incidenciaActual === 'devolucion_compra' ? 'selected' : ''}>Devolución compra</option>
        </select>
      </td>
      <td><button class="btn-action-success btn-guardar-linea-pre" type="button" data-linea-id="${p.id}">Guardar</button></td>`;
    body.appendChild(tr); aplicarEstiloFilaPre(tr, estadoPreview);
  });
  partidas.forEach(p => {
    document.getElementById(`recibido_${p.id}`)?.addEventListener('input', () => actualizarPreviewLineaPre(p.id, p.cantidad_esperada));
    document.getElementById(`incidencia_${p.id}`)?.addEventListener('change', () => actualizarPreviewLineaPre(p.id, p.cantidad_esperada));
    actualizarPreviewLineaPre(p.id, p.cantidad_esperada);
  });
  body.querySelectorAll('.btn-guardar-linea-pre').forEach(btn => btn.addEventListener('click', () => guardarLineaValidacionPre(Number(btn.dataset.lineaId))));
  preRenderIncidencias(); preSyncIncidenciaKpis(); preSyncScanProgress();
}
function renderListaPreLigados() {
  const contenedor = document.getElementById('listaPreLigados'); if (!contenedor) return; contenedor.innerHTML = '';
  if (!estadoPreTurno.documentosLigados.length) { contenedor.innerHTML = `<div class="empty-state-mini">No hay documentos ligados a esta unidad.</div>`; return; }
  estadoPreTurno.documentosLigados.forEach(doc => {
    const active = estadoPreTurno.documentoActivo && Number(estadoPreTurno.documentoActivo.id) === Number(doc.id);
    const el = document.createElement('div'); el.className = `pre-item ${active ? 'active' : ''}`;
    el.innerHTML = `<div class="pre-item-title">${escaparHTML(doc.pre_entrada_compra || 'PRE pendiente')}</div><div class="pre-item-meta">${escaparHTML(doc.proveedor || '-')}<br>Ref: ${escaparHTML(doc.referencia || '-')}<br>${escaparHTML(doc.fecha_documento || '-')}</div>`;
    el.addEventListener('click', async () => { await cargarDetallePreLigado(doc.id); });
    contenedor.appendChild(el);
  });
}
async function cargarPreLigadosTurno(turnoId) {
  try {
    const res = await fetch(`/api/turnos/${encodeURIComponent(turnoId)}/pre-documentos`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No fue posible obtener los documentos ligados.');
    estadoPreTurno.documentosLigados = Array.isArray(data) ? data : [];
    renderListaPreLigados();
  } catch (error) {
    console.error(error);
    AzToast.error(error.message || 'Error al consultar documentos PRE.', { title: 'PRE ligados' });
  }
}
async function cargarDetallePreLigado(documentoId) {
  if (!estadoPreTurno.turnoActivo) return;
  try {
    const turnoId = estadoPreTurno.turnoActivo.id;
    const resValidacion = await fetch(`/api/turnos/${encodeURIComponent(turnoId)}/pre-documentos/${encodeURIComponent(documentoId)}/validacion`);
    const dataValidacion = await resValidacion.json();
    if (!resValidacion.ok) throw new Error(dataValidacion.error || 'No fue posible cargar el PRE ligado.');
    estadoPreTurno.modoValidacion = ['en_validacion', 'validado', 'con_incidencias', 'cerrado'].includes(dataValidacion.documento.estado_validacion);
    estadoPreTurno.turnoPreDocumentoId = dataValidacion.documento.id;
    estadoPreTurno.documentoActivo = dataValidacion.documento;
    estadoPreTurno.lineasValidacion = dataValidacion.partidas || [];
    pintarEncabezadoPreDocumento(dataValidacion.documento);
    if (!estadoPreTurno.modoValidacion) {
      const resDoc = await fetch(`/api/pre/documentos/${encodeURIComponent(documentoId)}`);
      const dataDoc = await resDoc.json();
      if (!resDoc.ok) throw new Error(dataDoc.error || 'No fue posible cargar el detalle importado.');
      renderTablaPreModoLectura(dataDoc.partidas || []);
    } else {
      renderTablaPreValidacion(estadoPreTurno.lineasValidacion);
    }
    renderListaPreLigados(); preRenderIncidencias(); preSyncIncidenciaKpis(); preSyncScanProgress();
  } catch (error) {
    console.error(error);
    AzToast.error(error.message || 'No fue posible abrir el PRE.', { title: 'Detalle PRE' });
  }
}
async function iniciarValidacionPreActual() {
  if (!estadoPreTurno.turnoActivo || !estadoPreTurno.documentoActivo) return;
  const confirmar = confirm(`¿Iniciar validación para el PRE ${estadoPreTurno.documentoActivo.pre_entrada_compra || 'pendiente'}?`);
  if (!confirmar) return;
  try {
    const res = await fetch(`/api/turnos/${encodeURIComponent(estadoPreTurno.turnoActivo.id)}/pre-documentos/${encodeURIComponent(estadoPreTurno.documentoActivo.pre_documento_id || estadoPreTurno.documentoActivo.id)}/iniciar-validacion`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No fue posible iniciar la validación.');
    AzToast.success('Validación iniciada correctamente.', { title: 'PRE en validación' });
    await cargarDetallePreLigado(estadoPreTurno.documentoActivo.pre_documento_id || estadoPreTurno.documentoActivo.id);
    await cargarPreLigadosTurno(estadoPreTurno.turnoActivo.id);
    await cargarTurnosAdmin();
  } catch (error) {
    console.error(error);
    AzToast.error(error.message || 'No se pudo iniciar la validación.', { title: 'Validación' });
  }
}
function abrirModalIncidenciaPre(linea) {
  estadoPreTurno.incidenciaPendiente = linea;
  const meta = document.getElementById('incidenciaPreMeta');
  const esperado = Number(linea.cantidad_esperada || 0);
  const recibido = Number(document.getElementById(`recibido_${linea.id}`)?.value || 0);
  const diferenciaAbs = Math.abs(recibido - esperado);
  if (meta) meta.innerText = `${linea.articulo || '-'} | Esperado: ${esperado} | Recibido: ${recibido}`;
  const selectTipo = document.getElementById('incidenciaPreTipo'); const cantidad = document.getElementById('incidenciaPreCantidad'); const obs = document.getElementById('incidenciaPreObservacion');
  const incidenciaActual = document.getElementById(`incidencia_${linea.id}`)?.value || '';
  if (selectTipo) selectTipo.value = incidenciaActual || '';
  if (cantidad) cantidad.value = diferenciaAbs || 1;
  if (obs) obs.value = '';
  document.getElementById('modalIncidenciaPre')?.classList.add('active');
}
function cerrarModalIncidenciaPre() { document.getElementById('modalIncidenciaPre')?.classList.remove('active'); estadoPreTurno.incidenciaPendiente = null; }
async function guardarLineaValidacionPre(lineaId) {
  const recibidoEl = document.getElementById(`recibido_${lineaId}`); const incidenciaEl = document.getElementById(`incidencia_${lineaId}`); if (!recibidoEl || !incidenciaEl) return;
  const cantidad_recibida = Number(recibidoEl.value || 0); const incidencia_tipo = incidenciaEl.value || '';
  const linea = (estadoPreTurno.lineasValidacion || []).find(x => Number(x.id) === Number(lineaId));
  if (!linea) { AzToast.warning('No se encontró la línea seleccionada.', { title: 'Línea PRE' }); return; }
  if (incidencia_tipo) { abrirModalIncidenciaPre(linea); return; }
  try {
    const res = await fetch(`/api/turno-pre-partidas/${encodeURIComponent(lineaId)}/guardar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cantidad_recibida, incidencia_tipo: '', incidencia_observacion: '' }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No fue posible guardar la línea.');
    AzToast.success('Línea validada correctamente.', { title: 'Guardado' });
    if (estadoPreTurno.turnoActivo && estadoPreTurno.documentoActivo) {
      await cargarDetallePreLigado(estadoPreTurno.documentoActivo.pre_documento_id || estadoPreTurno.documentoActivo.id);
      await cargarPreLigadosTurno(estadoPreTurno.turnoActivo.id);
      await cargarTurnosAdmin();
    }
  } catch (error) {
    console.error(error);
    AzToast.error(error.message || 'No fue posible guardar la línea.', { title: 'Línea PRE' });
  }
}


(function adminV49FiltroFilasPre() {
  function preV49Texto(v) {
    return String(v ?? '').trim();
  }

  function preV49EsFilaBasura(linea) {
    const articulo = preV49Texto(linea?.articulo).toUpperCase();
    const descripcion = preV49Texto(linea?.descripcion);
    const esperado = Number(linea?.cantidad_esperada ?? 0);
    const orden = preV49Texto(linea?.orden_linea);

    // 1) Sin artículo real
    if (!articulo) return true;

    // 2) Filas de unidad/totales mal importadas (como la del screenshot: articulo=PIEZA, descripcion='-', esperado=0)
    const articulosResumen = ['PIEZA', 'PIEZAS', 'PZA', 'PZAS', 'CAJA', 'CAJAS', 'PALLET', 'PALLETS'];
    if (
      articulosResumen.includes(articulo) &&
      (!descripcion || descripcion === '-' || descripcion === '--') &&
      esperado === 0
    ) {
      return true;
    }

    // 3) Filas comodín sin orden, sin descripción y sin esperado
    if (!orden && (!descripcion || descripcion === '-' || descripcion === '--') && esperado === 0) {
      return true;
    }

    return false;
  }

  function preV49FiltrarPartidas(partidas) {
    if (!Array.isArray(partidas)) return [];
    return partidas.filter(p => !preV49EsFilaBasura(p));
  }

  // Override ligero de ambos renders usando las funciones ya existentes
  const __preV49RenderLecturaOriginal = typeof renderTablaPreModoLectura === 'function' ? renderTablaPreModoLectura : null;
  if (__preV49RenderLecturaOriginal) {
    renderTablaPreModoLectura = function(partidas) {
      return __preV49RenderLecturaOriginal(preV49FiltrarPartidas(partidas));
    };
  }

  const __preV49RenderValidacionOriginal = typeof renderTablaPreValidacion === 'function' ? renderTablaPreValidacion : null;
  if (__preV49RenderValidacionOriginal) {
    renderTablaPreValidacion = function(partidas) {
      return __preV49RenderValidacionOriginal(preV49FiltrarPartidas(partidas));
    };
  }

  // Exponer helper por si quieres probarlo manualmente en consola
  window.preV49FiltrarPartidas = preV49FiltrarPartidas;
  window.preV49EsFilaBasura = preV49EsFilaBasura;

  console.info('Admin PRE V4.9 filtro de filas basura cargado');
})();


async function guardarIncidenciaPreDesdeModal() {
  const linea = estadoPreTurno.incidenciaPendiente; if (!linea) return;
  const lineaId = Number(linea.id); const cantidad_recibida = Number(document.getElementById(`recibido_${lineaId}`)?.value || 0); const tipo = document.getElementById('incidenciaPreTipo')?.value || ''; const cantidadAfectada = Number(document.getElementById('incidenciaPreCantidad')?.value || 0); const observacion = document.getElementById('incidenciaPreObservacion')?.value.trim() || '';
  if (!tipo) { AzToast.warning('Debes seleccionar un tipo de incidencia.', { title: 'Incidencia' }); return; }
  try {
    const resGuardar = await fetch(`/api/turno-pre-partidas/${encodeURIComponent(lineaId)}/guardar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cantidad_recibida, incidencia_tipo: tipo, incidencia_observacion: observacion }) });
    const dataGuardar = await resGuardar.json(); if (!resGuardar.ok) throw new Error(dataGuardar.error || 'No fue posible guardar la línea con incidencia.');
    const resInc = await fetch(`/api/turno-pre-partidas/${encodeURIComponent(lineaId)}/incidencia`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo_incidencia: tipo, cantidad_afectada: cantidadAfectada, observacion }) });
    const dataInc = await resInc.json(); if (!resInc.ok) throw new Error(dataInc.error || 'No fue posible registrar la incidencia.');
    AzToast.success('Incidencia guardada correctamente.', { title: 'Incidencia PRE' }); cerrarModalIncidenciaPre();
    if (estadoPreTurno.turnoActivo && estadoPreTurno.documentoActivo) {
      await cargarDetallePreLigado(estadoPreTurno.documentoActivo.pre_documento_id || estadoPreTurno.documentoActivo.id);
      await cargarPreLigadosTurno(estadoPreTurno.turnoActivo.id);
      await cargarTurnosAdmin();
    }
  } catch (error) {
    console.error(error);
    AzToast.error(error.message || 'No fue posible guardar la incidencia.', { title: 'Incidencia PRE' });
  }
}
function abrirModalCerrarValidacionPre() {
  if (!estadoPreTurno.documentoActivo) return;
  const meta = document.getElementById('cerrarPreMeta');
  if (meta) meta.innerText = `PRE: ${estadoPreTurno.documentoActivo.pre_entrada_compra || 'PRE pendiente'}`;
  const palletsEl = document.getElementById('cerrarPrePallets'); const obsEl = document.getElementById('cerrarPreObservaciones');
  if (palletsEl) palletsEl.value = estadoPreTurno.documentoActivo.pallets_descargados || '';
  if (obsEl) obsEl.value = estadoPreTurno.documentoActivo.observaciones_generales || '';
  document.getElementById('modalCerrarValidacionPre')?.classList.add('active');
}
function cerrarModalCerrarValidacionPre() { document.getElementById('modalCerrarValidacionPre')?.classList.remove('active'); }
function cerrarValidacionPreActual() { if (!estadoPreTurno.turnoActivo || !estadoPreTurno.documentoActivo) return; abrirModalCerrarValidacionPre(); }
async function confirmarCerrarValidacionPre() {
  if (!estadoPreTurno.turnoActivo || !estadoPreTurno.documentoActivo) return;
  const pallets = document.getElementById('cerrarPrePallets')?.value || ''; const observaciones = document.getElementById('cerrarPreObservaciones')?.value.trim() || '';
  try {
    const res = await fetch(`/api/turnos/${encodeURIComponent(estadoPreTurno.turnoActivo.id)}/pre-documentos/${encodeURIComponent(estadoPreTurno.documentoActivo.pre_documento_id || estadoPreTurno.documentoActivo.id)}/cerrar-validacion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pallets_descargados: pallets, observaciones_generales: observaciones, firma_recibidor: '' }) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error || 'No fue posible cerrar la validación del documento.');
    AzToast.success('Documento validado/cerrado correctamente.', { title: 'Cierre PRE' }); cerrarModalCerrarValidacionPre();
    await cargarDetallePreLigado(estadoPreTurno.documentoActivo.pre_documento_id || estadoPreTurno.documentoActivo.id);
    await cargarPreLigadosTurno(estadoPreTurno.turnoActivo.id);
    await cargarTurnosAdmin();
  } catch (error) {
    console.error(error);
    AzToast.error(error.message || 'No fue posible cerrar la validación.', { title: 'Cerrar PRE' });
  }
}
async function buscarDocumentosPreAdmin() {
  const q = document.getElementById('buscarDocumentoPreAdmin')?.value.trim() || '';
  const resultados = document.getElementById('resultadosBusquedaPreAdmin'); if (!resultados) return;
  if (!q || q.length < 2) {
    resultados.innerHTML = `<div class="empty-state-mini">Escribe al menos 2 caracteres para buscar.</div>`;
    return;
  }
  try {
    const res = await fetch(`/api/pre/documentos?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No fue posible buscar documentos PRE.');
    estadoPreTurno.resultadosBusqueda = Array.isArray(data) ? data : [];
    resultados.innerHTML = '';
    if (!estadoPreTurno.resultadosBusqueda.length) {
      resultados.innerHTML = `<div class="empty-state-mini">No se encontraron documentos con esa búsqueda.</div>`;
      return;
    }
    estadoPreTurno.resultadosBusqueda.forEach(doc => {
      const item = document.createElement('div'); item.className = 'pre-item';
      item.innerHTML = `<div class="pre-item-title">${escaparHTML(doc.pre_entrada_compra || 'PRE pendiente')}</div><div class="pre-item-meta">${escaparHTML(doc.proveedor || '-')}<br>Ref: ${escaparHTML(doc.referencia || '-')}<br>${escaparHTML(doc.fecha_documento || '-')}</div><div class="pre-item-actions"><button class="btn-action-primary" type="button">Asignar</button></div>`;
      item.querySelector('button')?.addEventListener('click', async () => { await asignarPreATurnoActual(doc.id); });
      resultados.appendChild(item);
    });
  } catch (error) {
    console.error(error);
    AzToast.error(error.message || 'No fue posible buscar documentos.', { title: 'Búsqueda PRE' });
  }
}
async function asignarPreATurnoActual(documentoId) {
  if (!estadoPreTurno.turnoActivo) return;
  try {
    const res = await fetch('/api/pre/asignar-a-turno', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turno_id: estadoPreTurno.turnoActivo.id, documentos: [documentoId] }) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error || 'No fue posible asignar el PRE a la unidad.');
    AzToast.success('Documento PRE ligado correctamente a la unidad.', { title: 'Ligado completo' });
    await cargarPreLigadosTurno(estadoPreTurno.turnoActivo.id); await cargarTurnosAdmin();
  } catch (error) {
    console.error(error);
    AzToast.error(error.message || 'No fue posible asignar el documento.', { title: 'Asignar PRE' });
  }
}
async function desasignarPreActual() {
  if (!estadoPreTurno.turnoActivo || !estadoPreTurno.documentoActivo) return;
  const confirmar = confirm(`¿Deseas quitar este PRE de la unidad?\n\nPRE: ${estadoPreTurno.documentoActivo.pre_entrada_compra || 'PRE pendiente'}`);
  if (!confirmar) return;
  try {
    const res = await fetch(`/api/turnos/${encodeURIComponent(estadoPreTurno.turnoActivo.id)}/pre-documentos/${encodeURIComponent(estadoPreTurno.documentoActivo.id)}`, { method: 'DELETE' });
    const data = await res.json(); if (!res.ok) throw new Error(data.error || 'No fue posible quitar el PRE de la unidad.');
    AzToast.success('Documento PRE desvinculado correctamente.', { title: 'Desasignado' }); estadoPreTurno.documentoActivo = null; resetDetallePreTurno(); resetHeroPreDocumento();
    await cargarPreLigadosTurno(estadoPreTurno.turnoActivo.id); await cargarTurnosAdmin();
  } catch (error) {
    console.error(error);
    AzToast.error(error.message || 'No fue posible quitar el PRE.', { title: 'Desasignar PRE' });
  }
}
function resaltarFilaPre(lineaId) {
  const fila = document.getElementById(`fila_pre_${lineaId}`);
  if (!fila) return;
  fila.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
async function procesarEscaneoPreManual() {
  if (!estadoPreTurno.turnoActivo || !estadoPreTurno.documentoActivo) { AzToast.warning('No hay documento PRE activo para escanear.', { title: 'Escaneo PRE' }); return; }
  if (!estadoPreTurno.modoValidacion) { AzToast.warning('Debes iniciar validación antes de escanear.', { title: 'Escaneo PRE' }); return; }
  const input = document.getElementById('scanPreInput'); const selectModo = document.getElementById('scanPreModoConteo');
  if (!input) return;
  const codigo = normalizarCodigoScan(input.value); const modo = selectModo?.value || 'pieza';
  if (!codigo) { mostrarResultadoScanPre('Escanea o escribe un código válido.', 'error'); return; }
  const linea = encontrarLineaPorCodigoEscaneado(codigo);
  if (!linea) { mostrarResultadoScanPre(`No se encontró una línea para el código "${codigo}".`, 'error'); AzToast.warning('Código no encontrado en este PRE.', { title: 'Escaneo PRE' }); return; }
  const resolucion = preResolverCantidad(linea, modo);
  if (modo === 'master' && (!resolucion.cantidad || resolucion.cantidad <= 0)) {
    mostrarResultadoScanPre('Captura manualmente cuántas piezas trae la caja master antes de procesar.', 'error');
    AzToast.warning('Debes indicar las piezas por caja master.', { title: 'Escaneo master' });
    return;
  }
  try {
    const res = await fetch(`/api/turno-pre-partidas/${encodeURIComponent(linea.id)}/lectura`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo_lectura: 'codigo_alterno', valor_lectura: codigo, cantidad_sumada: resolucion.cantidad, modo_escaneo: modo })
    });
    const data = await res.json(); if (!res.ok) throw new Error(data.error || 'No fue posible registrar la lectura.');
    let mensaje = `Lectura aplicada a ${linea.articulo || '-'} | +${resolucion.cantidad} recibido`;
    if (modo === 'pallet' && !resolucion.fallback) mensaje += ` (desde ${resolucion.raw || 'PALLET/CAMA'})`;
    if (modo === 'pallet' && resolucion.fallback) mensaje += ' (PALLET/CAMA no configurado, se sumó 1)';
    mostrarResultadoScanPre(mensaje, 'ok'); AzToast.success('Escaneo registrado correctamente.', { title: 'Lectura PRE' });
    input.value = '';
    if (modo === 'master' && linea.articulo && resolucion.cantidad > 0) preGuardarMasterSku(linea.articulo, resolucion.cantidad);
    await cargarDetallePreLigado(estadoPreTurno.documentoActivo.pre_documento_id || estadoPreTurno.documentoActivo.id);
    await cargarPreLigadosTurno(estadoPreTurno.turnoActivo.id); await cargarTurnosAdmin();
    const lineaRecargada = (estadoPreTurno.lineasValidacion || []).find(l => Number(l.id) === Number(linea.id)) || linea;
    const timestamp = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    estadoScanPre.historialEscaneos.push({
      lineaId: lineaRecargada.id, articulo: lineaRecargada.articulo || '-', descripcion: lineaRecargada.descripcion || '-', esperado: Number(lineaRecargada.cantidad_esperada || 0), recibido: Number(lineaRecargada.cantidad_recibida || 0), incidencia: lineaRecargada.incidencia_tipo || '', estado: preEstadoLinea(lineaRecargada.cantidad_esperada, lineaRecargada.cantidad_recibida, lineaRecargada.incidencia_tipo), timestamp, modo, cantidadSumada: resolucion.cantidad, fallback: resolucion.fallback, fuenteExtra: resolucion.fuente, rawPalletCama: resolucion.raw || ''
    });
    preRenderScanFeed(); preRenderIncidencias(); preSyncIncidenciaKpis(); preSyncScanProgress(); preAutocompletarMasterDesdeCodigo();
    setTimeout(() => resaltarFilaPre(linea.id), 120);
  } catch (error) {
    console.error(error);
    mostrarResultadoScanPre(error.message || 'No fue posible registrar la lectura.', 'error');
    AzToast.error(error.message || 'No fue posible registrar la lectura.', { title: 'Escaneo PRE' });
  }
}

// ================= API TURNOS =================
async function actualizarTurno(payload, mensajeError = 'Ocurrió un error al actualizar el turno') {
  try {
    const res = await fetch('/api/actualizar-turno', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const datos = await res.json(); AzToast.error(datos.error || mensajeError, { title: 'Error' }); return false;
    }
    AzToast.success('Turno actualizado correctamente.', { duration: 1500 }); return true;
  } catch (error) {
    console.error('Error al conectar con /api/actualizar-turno:', error); AzToast.error('Error de conexión con el servidor.', { title: 'Conexión' }); return false;
  }
}
async function cargarTurnosAdmin() {
  try {
    const inputBusqueda = document.getElementById('busquedaGlobalAdmin');
    const queryAdmin = inputBusqueda ? inputBusqueda.value.toLowerCase().trim() : '';
    const [resPatio, resHistorial, resProgramados] = await Promise.all([fetch('/api/turnos'), fetch('/api/historial'), fetch('/api/programados')]);
    let patio = await resPatio.json(); let historial = await resHistorial.json(); const programados = await resProgramados.json();
    if (queryAdmin.length >= 2) {
      const coincide = (t) => (t.proveedor && t.proveedor.toLowerCase().includes(queryAdmin)) || (t.nombre_operador && t.nombre_operador.toLowerCase().includes(queryAdmin)) || (t.telefono && t.telefono.toLowerCase().includes(queryAdmin)) || (t.placas && t.placas.toLowerCase().includes(queryAdmin)) || (t.folio && t.folio.toLowerCase().includes(queryAdmin));
      patio = patio.filter(coincide); const programadasCoincidentes = programados.filter(coincide); historial = [...programadasCoincidentes, ...historial.filter(coincide)];
    }
    listaTurnosLocal = Array.isArray(patio) ? patio : []; historialGlobal = Array.isArray(historial) ? historial : [];
    renderizarPatio(); aplicarFiltroHistorial();
  } catch (error) {
    console.error('Error al solicitar datos al servidor:', error);
  }
}
function obtenerNivelAlerta(turno) {
  if (turno.estatus !== 'En Descarga' || !turno.hora_inicio_descarga) return null;
  const inicio = obtenerFechaSegura(turno.hora_inicio_descarga); if (!inicio) return null;
  const minutos = (new Date() - inicio) / 60000; if (minutos >= 70) return 'critico'; if (minutos >= 40) return 'alerta'; return 'normal';
}

function renderizarPatio() {
    const contenedor = document.getElementById('tab-patio');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    // ================= HELPERS LOCALES SOLO PARA ESTA FUNCIÓN =================
    function normalizarListaTextoLocal(valor) {
        if (Array.isArray(valor)) {
            return valor.map(v => String(v || '').trim()).filter(Boolean);
        }

        if (valor == null) return [];

        if (typeof valor === 'object') {
            const posibles = ['folio', 'factura', 'entrada', 'pre_entrada', 'numero', 'referencia'];
            return posibles
                .map(k => valor[k])
                .filter(Boolean)
                .map(v => String(v).trim())
                .filter(Boolean);
        }

        const str = String(valor).trim();
        if (!str) return [];

        if (str.startsWith('[') && str.endsWith(']')) {
            try {
                const parsed = JSON.parse(str);
                return normalizarListaTextoLocal(parsed);
            } catch (e) {
                // si no es JSON válido, seguimos con split normal
            }
        }

        return str
            .split(/[;,|\n]+/)
            .map(v => String(v || '').trim())
            .filter(Boolean);
    }

    function obtenerEntradasAsignadasLocal(turno) {
        const candidatos = [
            turno?.entradas_asignadas,
            turno?.entradasAsignadas,
            turno?.facturas_asignadas,
            turno?.facturasAsignadas,
            turno?.folios_asignados,
            turno?.foliosAsignados,
            turno?.facturas,
            turno?.entradas,
            turno?.pre_entradas,
            turno?.preEntradas,
            turno?.folios,
            turno?.folio
        ];

        for (const candidato of candidatos) {
            const lista = normalizarListaTextoLocal(candidato);
            if (lista.length) return lista;
        }

        return [];
    }

    function renderEntradasAsignadasLocal(turno) {
        const entradas = obtenerEntradasAsignadasLocal(turno);
        const total = entradas.length;

        if (total <= 0) {
            return {
                label: 'Folio:',
                html: '<span>-</span>'
            };
        }

        if (total === 1) {
            return {
                label: 'Folio:',
                html: `<span>${escaparHTML(entradas[0])}</span>`
            };
        }

        const tooltip = escaparHTML(entradas.join('\n'));
        return {
            label: 'Folio:',
            html: `
                <div class="tooltip-folios" data-folios="${tooltip}">
                    (${total}) <span class="icono-ayuda">?</span>
                </div>
            `
        };
    }

    // ================= FILTRO / ORDEN =================
    const filtroEl = document.getElementById('filtroFecha');
    const filtro = filtroEl ? filtroEl.value : 'todos';
    const hoyStr = new Date().toISOString().split('T')[0];

    let turnosFiltrados = [...listaTurnosLocal];

    if (filtro === 'hoy') {
        turnosFiltrados = turnosFiltrados.filter(t => {
            const fechaDato = obtenerFechaVisibleAdmin(t);
            return fechaDato && fechaDato.startsWith(hoyStr);
        });
    }

    turnosFiltrados.sort((a, b) => {
        const aTieneAnden = !!a.anden;
        const bTieneAnden = !!b.anden;

        if (aTieneAnden && !bTieneAnden) return -1;
        if (!aTieneAnden && bTieneAnden) return 1;

        if (aTieneAnden && bTieneAnden) {
            const andenA = parseInt(a.anden, 10) || 999;
            const andenB = parseInt(b.anden, 10) || 999;

            if (andenA !== andenB) return andenA - andenB;
            if (a.estatus === 'En Descarga' && b.estatus !== 'En Descarga') return -1;
            if (b.estatus === 'En Descarga' && a.estatus !== 'En Descarga') return 1;
        }

        if (a.prioridad === 'URGENTE' && b.prioridad !== 'URGENTE') return -1;
        if (b.prioridad === 'URGENTE' && a.prioridad !== 'URGENTE') return 1;

        const parsedA = obtenerFechaSegura(obtenerFechaVisibleAdmin(a));
        const parsedB = obtenerFechaSegura(obtenerFechaVisibleAdmin(b));

        if (!parsedA && !parsedB) return 0;
        if (!parsedA) return 1;
        if (!parsedB) return -1;

        return parsedA - parsedB;
    });

    const countPatio = document.getElementById('countPatio');
    if (countPatio) {
        countPatio.innerText = turnosFiltrados.length;
    }

    const idsActuales = new Set(turnosFiltrados.map(t => t.id));

    // ================= RENDER =================
    turnosFiltrados.forEach(t => {
        const esNuevo = !idsPrevios.has(t.id);
        const nivelAlerta = obtenerNivelAlerta(t);
        const statusVisual = window.AzStatus.getStatusVisual(t.estatus, t);
        const visualCategoria = window.AzUI.getCategoryVisual(t.categoria);
        const nombreCategoria = visualCategoria.nombreTarjeta || visualCategoria.nombre;
        const iconoUnidad = t.tipo_unidad && t.tipo_unidad.toLowerCase().includes('camioneta') ? '🚚' : '🚛';
        const esUrgente = t.prioridad === 'URGENTE';

        // NUEVO: entradas/facturas asignadas
        const entradasUI = renderEntradasAsignadasLocal(t);

        let accionPrincipalHTML = '';
        const totalPre = Number(t.total_pre || 0);

        let botonPreHTML = `
            <button class="btn-action-neutral" onclick="abrirModalPreTurno(${t.id})">
                📄 PRE${totalPre > 0 ? ` (${totalPre})` : ''}
            </button>
        `;

        if (puedeLlamarAAnden(t)) {
            accionPrincipalHTML = `
                <button class="btn-action-primary" onclick="llamarUnidad(${t.id})">
                    🔔 Llamar a Andén
                </button>
            `;
        } else if (puedeIniciarDescarga(t)) {
            accionPrincipalHTML = `
                <button class="btn-action-success" onclick="iniciarDescarga(${t.id})">
                    ▶ Iniciar Descarga
                </button>
            `;
        } else if (estaEnDescarga(t)) {
            // CAMBIO: "Ver" -> "PRE"
            accionPrincipalHTML = `
                <div class="acciones-grid">
                    <button class="btn-action-info" onclick="abrirModalPreTurno(${t.id})">
                        📄 PRE
                    </button>
                    <button class="btn-action-warning" onclick="llamarSiguiente()">
                        🔔 Sig
                    </button>
                    <button class="btn-action-danger" onclick="finalizarTurno(${t.id})">
                        Finalizar
                    </button>
                </div>
            `;

            // Evita duplicar PRE abajo si ya está en la grilla principal
            botonPreHTML = '';
        }

        const botonesHTML = `
            ${accionPrincipalHTML}
            ${botonPreHTML}
        `;

        contenedor.innerHTML += `
            <div
                class="card-admin card-entrega ${statusVisual.classEstado} ${nivelAlerta ? 'alerta-' + nivelAlerta : ''} ${esNuevo ? 'nueva-unidad' : ''}"
                data-id="${t.id}"
                draggable="true"
                style="--color-card:${escaparHTML(visualCategoria.color)};"
            >
                ${esUrgente ? `<div class="urgente-bar">🚨 UNIDAD URGENTE</div>` : ''}

                <div class="card-admin-top">
                    <div class="icono-box">${iconoUnidad}</div>
                    <span class="badge ${escaparHTML(statusVisual.badgeClass)}">${escaparHTML(statusVisual.badgeText)}</span>
                    <span class="timer-chip">⏱ ${escaparHTML(obtenerMinutosEspera(t))}</span>
                </div>

                <div class="card-admin-body">
                    <div class="titulo-operador">${escaparHTML(t.nombre_operador || 'Sin nombre')}</div>

                    <div class="datos-lista">
                        <div class="linea-dato">
                            <span class="dato-icono">${escaparHTML(visualCategoria.icono)}</span>
                            <b>Área:</b>
                            <span class="valor-area">${escaparHTML(nombreCategoria || '-')}</span>
                        </div>

                        <div class="linea-dato">
                            <span class="dato-icono">📄</span>
                            <b>${escaparHTML(entradasUI.label)}</b>
                            ${entradasUI.html}
                        </div>

                        <div class="linea-dato">
                            <span class="dato-icono">🚚</span>
                            <b>Unidad:</b>
                            <span>${escaparHTML(t.tipo_unidad || '-')} ${t.placas ? `(${escaparHTML(t.placas)})` : ''}</span>
                        </div>

                        <div class="linea-dato">
                            <span class="dato-icono">🏢</span>
                            <b>Proveedor:</b>
                            <span>${escaparHTML(t.proveedor || '-')}</span>
                        </div>

                        <div class="linea-dato entrega">
                            <span class="dato-icono">📦</span>
                            <b>Entrega:</b>
                            <span>${escaparHTML(t.cantidad || '0')}</span>
                        </div>

                        <div class="linea-dato">
                            <span class="dato-icono">📞</span>
                            <b>Tel:</b>
                            <span>${escaparHTML(t.telefono || '-')}</span>
                        </div>

                        <div class="linea-dato">
                            <span class="dato-icono">📅</span>
                            <b>Arribo:</b>
                            <span>${escaparHTML(obtenerFechaVisibleAdmin(t) || '-')}</span>
                        </div>

                        ${
                            t.hora_inicio_descarga
                                ? `
                            <div class="linea-dato inicio">
                                <span class="dato-icono">🕒</span>
                                <b>Inicio:</b>
                                <span>${escaparHTML(t.hora_inicio_descarga)}</span>
                            </div>
                        `
                                : ''
                        }
                    </div>
                </div>

                <div class="card-admin-footer">
                    ${botonesHTML}
                </div>
            </div>
        `;
    });

    idsPrevios = idsActuales;
}

function renderizarHistorial(historial) {
  const contenedor = document.getElementById('tab-historial'); if (!contenedor) return; contenedor.innerHTML = '';
  const countHistorial = document.getElementById('countHistorial'); if (countHistorial) countHistorial.innerText = historial.length;
  historial.forEach(t => {
    const visualCategoria = window.AzUI.getCategoryVisual(t.categoria); const nombreCategoria = visualCategoria.nombreTarjeta || visualCategoria.nombre; const iconoUnidad = t.tipo_unidad && t.tipo_unidad.toLowerCase().includes('camioneta') ? '🚚' : '🚛';
    let tiempoDescarga = 'No medido'; if (t.hora_inicio_descarga && t.hora_fin_descarga) { const inicio = obtenerFechaSegura(t.hora_inicio_descarga); const fin = obtenerFechaSegura(t.hora_fin_descarga); if (inicio && fin) tiempoDescarga = `${Math.round((fin - inicio) / 60000)} min`; }
    contenedor.innerHTML += `
      <div class="card-admin estado-finalizado" style="--color-card:${escaparHTML(visualCategoria.color)};">
        <div class="card-admin-top"><div class="icono-box">${iconoUnidad}</div><span class="badge badge-finalizado">FINALIZADO</span></div>
        <div class="card-admin-body"><div class="titulo-operador">${escaparHTML(t.nombre_operador || 'Sin nombre')}</div><div style="font-size:0.78rem; color:#64748b; font-weight:600; margin:-4px 0 10px;">Turno concluido / unidad liberada</div><div class="datos-lista">
          <div class="linea-dato"><span class="dato-icono">${escaparHTML(visualCategoria.icono)}</span><b>Área:</b><span>${escaparHTML(nombreCategoria || '-')}</span></div>
          <div class="linea-dato"><span class="dato-icono">📄</span><b>Folio:</b><span>${escaparHTML(t.folio || '-')}</span></div>
          <div class="linea-dato"><span class="dato-icono">🚚</span><b>Unidad:</b><span>${escaparHTML(t.tipo_unidad || '-')}</span></div>
          <div class="linea-dato"><span class="dato-icono">🏢</span><b>Proveedor:</b><span>${escaparHTML(t.proveedor || '-')}</span></div>
          <div class="linea-dato cantidad"><span class="dato-icono">📦</span><b>Entrega:</b><span>${escaparHTML(t.cantidad || 'No especificado')}</span></div>
          <div class="linea-dato"><span class="dato-icono">📞</span><b>Tel:</b><span>${escaparHTML(t.telefono || '-')}</span></div>
          <div class="linea-dato"><span class="dato-icono">📅</span><b>Llegada:</b><span>${escaparHTML(t.hora_llegada || '-')}</span></div>
          <div class="linea-dato inicio"><span class="dato-icono">⏱</span><b>Tiempo:</b><span>${escaparHTML(tiempoDescarga)}</span></div>
        </div></div><div class="card-admin-footer"><button class="btn-action-neutral" onclick="solicitarReactivacion(${t.id}, '${escaparHTML(t.proveedor || t.placas || 'Turno')}')">🔄 Reactivar turno</button></div></div>`;
  });
}
function inicioDeHoy() { const hoy = new Date(); hoy.setHours(0, 0, 0, 0); return hoy; }
function inicioDeSemana() { const hoy = new Date(); const dia = hoy.getDay(); const diferencia = dia === 0 ? 6 : dia - 1; const inicio = new Date(hoy); inicio.setDate(hoy.getDate() - diferencia); inicio.setHours(0, 0, 0, 0); return inicio; }
function filtrarHistorial(historial, filtro) {
  if (!historial || !historial.length) return []; if (filtro === 'todos') return historial;
  const hoyInicio = inicioDeHoy(); const semanaInicio = inicioDeSemana();
  return historial.filter(t => { if (!t.hora_llegada) return false; const fecha = obtenerFechaSegura(t.hora_llegada); if (!fecha) return false; if (filtro === 'hoy') return fecha >= hoyInicio; if (filtro === 'semana') return fecha >= semanaInicio; return true; });
}
function aplicarFiltroHistorial() {
  const filtroEl = document.getElementById('filtroHistorial'); const filtro = filtroEl ? filtroEl.value : 'hoy';
  const filtrados = filtrarHistorial(historialGlobal, filtro);
  filtrados.sort((a, b) => { const fechaA = obtenerFechaSegura(a.hora_fin_descarga || a.hora_llegada || ''); const fechaB = obtenerFechaSegura(b.hora_fin_descarga || b.hora_llegada || ''); if (!fechaA && !fechaB) return 0; if (!fechaA) return 1; if (!fechaB) return -1; return fechaB - fechaA; });
  renderizarHistorial(filtrados);
}
function validarAnden(tipoUnidad, anden) {
  if (!tipoUnidad || tipoUnidad.trim() === '' || tipoUnidad.trim() === '-') { AzToast.warning('No se puede asignar andén porque la unidad no tiene tipo de unidad registrado.', { title: 'Acción denegada' }); return false; }
  const tipo = tipoUnidad.toLowerCase(); const numeroAnden = parseInt(anden, 10); if (Number.isNaN(numeroAnden)) { AzToast.warning('Debes indicar un número de andén válido.'); return false; }
  if (tipo.includes('plataforma') && numeroAnden > 2) { AzToast.error('Las unidades tipo Plataforma solo pueden ir a cortinas 1 y 2.', { title: 'Movimiento rechazado' }); return false; }
  if (tipo.includes('caja seca') && (numeroAnden === 1 || numeroAnden === 2)) { AzToast.error('Las unidades tipo Caja Seca solo pueden ir a cortinas 3 y 4.', { title: 'Movimiento rechazado' }); return false; }
  return true;
}
async function llamarUnidad(id) {
  const turno = [...listaTurnosLocal, ...historialGlobal].find(t => Number(t.id) === Number(id)); if (!turno) return;
  const anden = await AzSelectAnden(listaTurnosLocal); if (!anden || !validarAnden(turno.tipo_unidad, anden)) return;
  const ok = await AzConfirm({ title: 'Asignar andén', message: `¿Enviar unidad al andén ${anden}?`, confirmText: 'Confirmar', type: 'primary' }); if (!ok) return;
  await actualizarTurno({ id: Number(id), nuevoEstatus: 'Proximo a Anden', anden, tipo_unidad: turno.tipo_unidad }, 'Ocurrió un error al asignar el andén');
}
async function llamarSiguiente() {
  const disponibles = listaTurnosLocal.filter(t => normalizarEstatusTurno(t.estatus) === 'en espera'); if (disponibles.length === 0) { AzToast.info('No hay unidades disponibles en espera.'); return; }
  const idSeleccionado = await AzSelectUnidad(disponibles); if (!idSeleccionado) return;
  const turno = disponibles.find(t => Number(t.id) === Number(idSeleccionado)); if (!turno) { AzToast.error('No se encontró la unidad seleccionada.'); return; }
  const anden = await AzSelectAnden(listaTurnosLocal); if (!anden || !validarAnden(turno.tipo_unidad, anden)) return;
  const ok = await AzConfirm({ title: 'Asignar andén', message: `¿Enviar unidad al andén ${anden}?`, confirmText: 'Confirmar', type: 'primary' }); if (!ok) return;
  await actualizarTurno({ id: Number(idSeleccionado), nuevoEstatus: 'Proximo a Anden', anden, tipo_unidad: turno.tipo_unidad }, 'Ocurrió un error al asignar el andén');
}
async function iniciarDescarga(id) {
  const turno = listaTurnosLocal.find(t => Number(t.id) === Number(id)); if (!turno) return;
  const ok = await AzConfirm({ title: 'Iniciar descarga', message: '¿Confirmas que la descarga comienza en este momento?', confirmText: 'Iniciar', type: 'primary' }); if (!ok) return;
  await actualizarTurno({ id: Number(id), nuevoEstatus: 'En Descarga', marcar_inicio: true, anden: turno.anden, tipo_unidad: turno.tipo_unidad }, 'Ocurrió un error al iniciar la descarga');
}
async function finalizarTurno(id) {
  const turno = listaTurnosLocal.find(t => Number(t.id) === Number(id)); if (!turno) return;
  const ok = await AzConfirm({ title: 'Finalizar turno', message: '¿Liberar rampa y marcar como FINALIZADO?', confirmText: 'Finalizar', type: 'danger' }); if (!ok) return;
  await actualizarTurno({ id: Number(id), nuevoEstatus: 'Finalizado', marcar_fin: true, anden: turno.anden, tipo_unidad: turno.tipo_unidad }, 'Ocurrió un error al finalizar el turno');
}
async function solicitarReactivacion(id, identificador) {
  const turno = [...listaTurnosLocal, ...historialGlobal].find(t => Number(t.id) === Number(id));
  const ok = await AzConfirm({ title: 'Reactivar turno', message: `¿Reactivar el turno de "${identificador}"?\n\nSe regresará a la fila de espera.`, confirmText: 'Reactivar', type: 'primary' }); if (!ok) return;
  const actualizado = await actualizarTurno({ id: Number(id), nuevoEstatus: 'En Espera', limpiar_fin: true, anden: turno ? turno.anden : undefined, tipo_unidad: turno ? turno.tipo_unidad : undefined }, 'Ocurrió un error al reactivar el turno');
  if (actualizado) AzToast.success('Turno reactivado con éxito.', { title: 'Operación exitosa' });
}

// ================= DRAG & DROP =================
const contenedorPatio = document.getElementById('tab-patio'); let tarjetaArrastrada = null;
if (contenedorPatio) {
  contenedorPatio.addEventListener('dragstart', (e) => { const tarjeta = e.target.closest('.card-entrega'); if (tarjeta) { tarjetaArrastrada = tarjeta; tarjetaArrastrada.style.opacity = '0.55'; tarjetaArrastrada.classList.add('dragging'); } });
  contenedorPatio.addEventListener('dragend', async () => { if (tarjetaArrastrada) { tarjetaArrastrada.style.opacity = '1'; tarjetaArrastrada.classList.remove('dragging'); tarjetaArrastrada = null; await guardarNuevoOrdenManual(); } });
  contenedorPatio.addEventListener('dragover', (e) => { e.preventDefault(); const elementoDespues = obtenerElementoDestino(contenedorPatio, e.clientY); if (!tarjetaArrastrada) return; if (elementoDespues == null) contenedorPatio.appendChild(tarjetaArrastrada); else contenedorPatio.insertBefore(tarjetaArrastrada, elementoDespues); });
}
function obtenerElementoDestino(contenedor, y) {
  const elementosValidos = [...contenedor.querySelectorAll('.card-entrega:not(.dragging)')];
  return elementosValidos.reduce((masCercano, elemento) => {
    const caja = elemento.getBoundingClientRect(); const offset = y - caja.top - caja.height / 2; if (offset < 0 && offset > masCercano.offset) return { offset, element: elemento }; return masCercano;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}
async function guardarNuevoOrdenManual() {
  if (!contenedorPatio) return;
  const tarjetasEnPantalla = [...contenedorPatio.querySelectorAll('.card-entrega[data-id]')];
  const listaIds = tarjetasEnPantalla.map(tarjeta => Number(tarjeta.dataset.id)).filter(Boolean);
  if (!listaIds.length) return;
  try {
    await fetch('/api/reordenar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nuevoOrden: listaIds }) });
  } catch (error) {
    console.error('Error al guardar el orden:', error);
  }
}
function inicializarModoCompactoAdmin() {
  const topbar = document.querySelector('.module-toolbar') || document.querySelector('.dashboard-container');
  if (!topbar || document.querySelector('.density-toggle-wrap')) return;
  const wrap = document.createElement('div'); wrap.className = 'density-toggle-wrap';
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn-density-toggle';
  const estadoGuardado = localStorage.getItem('admin_modo_compacto') === '1'; if (estadoGuardado) document.body.classList.add('modo-compacto');
  const actualizarTexto = () => { btn.textContent = document.body.classList.contains('modo-compacto') ? '🧩 Vista compacta: ON' : '🧩 Vista compacta: OFF'; };
  actualizarTexto();
  btn.addEventListener('click', () => { document.body.classList.toggle('modo-compacto'); localStorage.setItem('admin_modo_compacto', document.body.classList.contains('modo-compacto') ? '1' : '0'); actualizarTexto(); });
  wrap.appendChild(btn); topbar.prepend(wrap);
}

// ================= CABLEADO =================
function cablearEventosPre() {
  document.getElementById('btnMostrarAsignacionPre')?.addEventListener('click', () => document.getElementById('panelAsignacionPre')?.classList.toggle('hidden'));
  document.getElementById('btnIniciarValidacionPre')?.addEventListener('click', iniciarValidacionPreActual);
  document.getElementById('btnCerrarValidacionPre')?.addEventListener('click', cerrarValidacionPreActual);
  document.getElementById('btnGuardarIncidenciaPreModal')?.addEventListener('click', guardarIncidenciaPreDesdeModal);
  document.getElementById('btnConfirmarCerrarValidacionPre')?.addEventListener('click', confirmarCerrarValidacionPre);
  document.getElementById('btnDesasignarPreActual')?.addEventListener('click', desasignarPreActual);
  let debounceBusquedaPre = null;
  document.getElementById('buscarDocumentoPreAdmin')?.addEventListener('input', () => { clearTimeout(debounceBusquedaPre); debounceBusquedaPre = setTimeout(buscarDocumentosPreAdmin, 250); });
  document.getElementById('scanPreModoConteo')?.addEventListener('change', preActualizarAyudaModo);
  document.getElementById('scanPreInput')?.addEventListener('input', preAutocompletarMasterDesdeCodigo);
  document.getElementById('scanPreInput')?.addEventListener('blur', preAutocompletarMasterDesdeCodigo);
  document.getElementById('btnProcesarScanPre')?.addEventListener('click', procesarEscaneoPreManual);
  document.getElementById('scanPreInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); procesarEscaneoPreManual(); } });
  document.getElementById('modalIncidenciaPre')?.addEventListener('click', (e) => { if (e.target.id === 'modalIncidenciaPre') cerrarModalIncidenciaPre(); });
  document.getElementById('modalCerrarValidacionPre')?.addEventListener('click', (e) => { if (e.target.id === 'modalCerrarValidacionPre') cerrarModalCerrarValidacionPre(); });
  document.getElementById('modalPreTurno')?.addEventListener('click', (e) => { if (e.target.id === 'modalPreTurno') cerrarModalPreTurno(); });
}

(function adminV50EstadoSync() {
  const KEY = 'azm_pre_estado_overrides_v1';
  const originalFetch = window.fetch.bind(window);

  function leerOverrides() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function guardarOverrides(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function guardarOverrideDocumento(docId, estado, extra = {}) {
    if (!docId) return;
    const map = leerOverrides();
    map[String(docId)] = {
      estado,
      updatedAt: new Date().toISOString(),
      ...extra
    };
    guardarOverrides(map);
  }

  async function obtenerDocsLigadosTurno(turnoId) {
    if (!turnoId) return [];
    try {
      const res = await originalFetch(`/api/turnos/${encodeURIComponent(turnoId)}/pre-documentos`);
      const data = await res.json();
      if (!res.ok) return [];
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('No se pudieron obtener docs ligados para sync frontend:', turnoId, e);
      return [];
    }
  }

  window.fetch = async function patchedFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : (input?.url || '');
    const method = String(init?.method || 'GET').toUpperCase();

    let payload = null;
    if (init?.body && typeof init.body === 'string') {
      try {
        payload = JSON.parse(init.body);
      } catch (e) {
        payload = null;
      }
    }

    // Si se finaliza turno, obtenemos docs ANTES de finalizar para no perder referencia
    let docsPreviosTurno = [];
    if (url.includes('/api/actualizar-turno') && method === 'POST' && payload?.nuevoEstatus === 'Finalizado' && payload?.id) {
      docsPreviosTurno = await obtenerDocsLigadosTurno(payload.id);
    }

    const response = await originalFetch(input, init);

    // Cierre de validación PRE -> revisado
    if (response.ok && url.includes('/cerrar-validacion') && method === 'POST') {
      try {
        const turnoId = window.estadoPreTurno?.turnoActivo?.id || null;
        const doc = window.estadoPreTurno?.documentoActivo || null;
        const docId = doc?.pre_documento_id || doc?.id || null;
        guardarOverrideDocumento(docId, 'revisado', {
          turnoId,
          proveedor: doc?.proveedor || '',
          referencia: doc?.referencia || '',
          pre: doc?.pre_entrada_compra || ''
        });
      } catch (e) {
        console.error('No se pudo guardar override revisado:', e);
      }
    }

    // Finalización de turno -> concluir todas las entradas ligadas a ese turno
    if (response.ok && url.includes('/api/actualizar-turno') && method === 'POST' && payload?.nuevoEstatus === 'Finalizado' && payload?.id) {
      try {
        docsPreviosTurno.forEach(doc => {
          const docId = doc?.pre_documento_id || doc?.id;
          guardarOverrideDocumento(docId, 'concluido', {
            turnoId: payload.id,
            proveedor: doc?.proveedor || '',
            referencia: doc?.referencia || '',
            pre: doc?.pre_entrada_compra || ''
          });
        });
      } catch (e) {
        console.error('No se pudo guardar override concluido:', e);
      }
    }

    return response;
  };

    console.info('Admin V5.0 sync de estados PRE cargado');
})();

cargarTurnosAdmin();
socket.on('actualizacion_turnos', cargarTurnosAdmin);
document.getElementById('filtroHistorial')?.addEventListener('change', aplicarFiltroHistorial);
let debounceBusquedaGlobal = null;
document.getElementById('busquedaGlobalAdmin')?.addEventListener('input', () => { clearTimeout(debounceBusquedaGlobal); debounceBusquedaGlobal = setTimeout(cargarTurnosAdmin, 250); });
inicializarModoCompactoAdmin();
cablearEventosPre();
preActualizarAyudaModo();
