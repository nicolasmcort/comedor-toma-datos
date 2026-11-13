/**
 * Apps Script para sync de la app de toma de datos → Google Sheets + Drive
 *
 * HOJA: https://docs.google.com/spreadsheets/d/1d9ENgcMqzBSVAOwZEWOjHpchaviAVXHoeKjGcmcR1WY/edit
 *
 * Cómo publicar (una sola vez):
 * 1. https://script.google.com → Nuevo proyecto
 * 2. Pega este código
 * 3. Guardar
 * 4. Implementar → Nueva implementación → Aplicación web
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquier persona
 * 5. Copiar la URL /exec y pegarla en la app
 *
 * La primera subida de foto crea la carpeta "Evidencias Comedor" en tu Drive.
 */

var SPREADSHEET_ID = "1d9ENgcMqzBSVAOwZEWOjHpchaviAVXHoeKjGcmcR1WY";
var FOLDER_NAME = "Evidencias Comedor";
// Debe coincidir con la contraseña del grupo en la app
var APP_PASSWORD = "unalcomedor";

function doGet() {
  return json_({ ok: true, service: "comedor-toma-datos", version: 3 });
}

function doPost(e) {
  try {
    var raw = e.postData && e.postData.contents ? e.postData.contents : "{}";
    var data = JSON.parse(raw);
    if (!data.password || String(data.password) !== APP_PASSWORD) {
      return json_({ ok: false, error: "No autorizado" });
    }
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (data.type === "evento" && data.row) {
      var sh = ss.getSheetByName("eventos");
      var id = String(data.row[0]);
      if (!idExists_(sh, id)) sh.appendRow(data.row);
      return json_({ ok: true, type: "evento", id: id });
    }

    if (data.type === "sesion" && data.row) {
      var sh2 = ss.getSheetByName("sesiones");
      var sid = String(data.row[0]);
      if (!idExists_(sh2, sid)) sh2.appendRow(data.row);
      else updateSession_(sh2, data.row);
      return json_({ ok: true, type: "sesion", id: sid });
    }

    if (data.type === "batch" && data.eventos) {
      var sh3 = ss.getSheetByName("eventos");
      var added = 0;
      data.eventos.forEach(function (row) {
        if (!idExists_(sh3, String(row[0]))) {
          sh3.appendRow(row);
          added++;
        }
      });
      return json_({ ok: true, type: "batch", added: added });
    }

    if (data.type === "evidencia" && data.meta && data.base64) {
      var result = saveEvidence_(data);
      var shE = ss.getSheetByName("evidencias");
      if (!shE) {
        shE = ss.insertSheet("evidencias");
        shE.appendRow([
          "id", "session_id", "fecha", "hora", "timestamp_iso",
          "rol", "observador", "tipo", "nombre_archivo", "drive_url", "drive_id", "notas"
        ]);
      }
      if (!idExists_(shE, String(data.meta.id))) {
        shE.appendRow([
          data.meta.id,
          data.meta.session_id || "",
          data.meta.fecha || "",
          data.meta.hora || "",
          data.meta.timestamp_iso || "",
          data.meta.rol || "",
          data.meta.observador || "",
          data.meta.tipo || "",
          data.meta.nombre_archivo || "",
          result.url,
          result.id,
          data.meta.notas || ""
        ]);
      }
      return json_({ ok: true, type: "evidencia", id: data.meta.id, url: result.url, fileId: result.id });
    }

    return json_({ ok: false, error: "payload desconocido" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function saveEvidence_(data) {
  var folder = getOrCreateFolder_();
  var mime = data.mime || "image/jpeg";
  var name = data.meta.nombre_archivo || (data.meta.id + ".jpg");
  var b64 = String(data.base64).replace(/^data:[^;]+;base64,/, "");
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, name);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { id: file.getId(), url: file.getUrl() };
}

function getOrCreateFolder_() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(FOLDER_NAME);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function idExists_(sheet, id) {
  if (!id) return false;
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var values = sheet.getRange(2, 1, last, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === id) return true;
  }
  return false;
}

function updateSession_(sheet, row) {
  var last = sheet.getLastRow();
  if (last < 2) {
    sheet.appendRow(row);
    return;
  }
  var ids = sheet.getRange(2, 1, last, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(row[0])) {
      sheet.getRange(i + 2, 1, i + 2, row.length).setValues([row]);
      return;
    }
  }
  sheet.appendRow(row);
}
