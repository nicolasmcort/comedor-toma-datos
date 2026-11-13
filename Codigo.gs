/**
 * Apps Script → Google Sheets + Drive
 *
 * HOJA (cuenta personal):
 * https://docs.google.com/spreadsheets/d/1k3cfW-U_YUYRNMiiZSZMaoOmLkjWd7R7fzv5fqNkfe4/edit
 * FOTOS: carpeta Drive "Evidencias Comedor" (se crea sola en la 1ª subida)
 *
 * Publicar UNA VEZ con la misma cuenta personal:
 * 1. script.google.com → Nuevo proyecto → pegar este código
 * 2. Implementar → Aplicación web
 *    - Ejecutar como: Yo
 *    - Acceso: Cualquier persona
 * 3. Copiar URL /exec → docs/config.json (cloudScriptUrl) o pásasela al asistente
 */

var SPREADSHEET_ID = "1k3cfW-U_YUYRNMiiZSZMaoOmLkjWd7R7fzv5fqNkfe4";
var FOLDER_NAME = "Evidencias Comedor";
var APP_PASSWORD = "unalcomedor";

function doGet() {
  return json_({ ok: true, service: "comedor-toma-datos", version: 4, folder: FOLDER_NAME });
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

    // Solo Drive (sin hoja "evidencias")
    if (data.type === "evidencia" && data.meta && data.base64) {
      var result = saveEvidence_(data);
      // deja rastro en eventos si viene eventRow
      if (data.eventRow && data.eventRow.length) {
        var shEv = ss.getSheetByName("eventos");
        var eid = String(data.eventRow[0]);
        // mete URL de Drive en notas (columna N = índice 13) si viene vacía
        if (!data.eventRow[13]) data.eventRow[13] = result.url;
        if (!idExists_(shEv, eid)) shEv.appendRow(data.eventRow);
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
