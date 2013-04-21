
/** ---------------------------------------------------------------------- */
/* @autor: Ola Gasidlo (o.gasidlo@gmail.com)
/* ----------------------------------------------------------------------- */

(function() {
	
// ---------------- Liste ----------------
	// Items erledigt / nicht erledigt
	$('#list li').click(function(){
		$(this).toggleClass("done");
	});













// Datenbank anlegen
 var request = indexedDB.open('eT', 2);

 // Änderungs/Erzeugungs-Event
request.onupgradeneeded = function(){
  console.log('Datenbank angelegt');
  var db = this.result;

console.log(db + "  -----  1");

  if(!db.objectStoreNames.contains('features2')){
    store = db.createObjectStore('features2', {
      keyPath: 'key',
      autoIncrement: true
    });
  }
};

// Öffnungs-Event (feuert nach upgradeneeded)
request.onsuccess = function(){
  console.log('Datenbank geöffnet');
  var db = this.result;

console.log(db + "  -----  2");
 }

 // Öffnungs-Event (feuert nach upgradeneeded)
request.error = function(){
  console.log('Datenbank failed');
}

// Zu speichernder Datensatz
var item = { title: 'Web Storage' };

// Speicher-Transaktion
var trans = db.transaction(['features2'], 'readwrite');

var store = trans.objectStore('features2  ')
var request = store.put(item); // `item` in dem Store ablegen


/*
// Erfolgs-Event
request.onsuccess = function(evt){
  console.log('Eintrag ' + evt.target.result + ' gespeichert');
};

var trans = db.transaction(['features'], 'readonly');
var store = trans.objectStore('features');


// Cursor für alle Einträge von 0 bis zum Ende
var range = IDBKeyRange.lowerBound(0);
var cursorRequest = store.openCursor(range);

// Wird für jeden gefundenen Datensatz aufgerufen... und einmal extra
cursorRequest.onsuccess = function(evt){
  var result = evt.target.result;
  };
  */
}());