
/** ---------------------------------------------------------------------- */
/* @autor: Ola Gasidlo (o.gasidlo@gmail.com)
/* ----------------------------------------------------------------------- */

var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB;
        var IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction;
        var db;

(function() {
	
    var eatThereData = [
        { name: "Currybox", str: "Boxhagenerstr. 21", ort:"11245 Berlin", flag: "y" },
        { name: "Frittiersalon", adresse: "Boxhagenerstr. 128", ort:"11245 Berlin", flag: "n" },
        { name: "Zeus", adresse: "Boxhagenerstr. 19", ort:"11245 Berlin", flag: "n" },
        { name: "Bäcker", adresse: "Boxhagenerstr. 17", ort:"11245 Berlin", flag: "y" }
    ];

    function initDb() {
        var request = indexedDB.open("eatThereDB", 1);                          //eatThere, Version 1 - open
        request.onsuccess = function (e) {                                      // done!
            db = request.result;                                                            
        };

        request.onerror = function (e) {                                        // fail!
            console.log("IndexedDB error: " + e.target.errorCode);
        };

        request.onupgradeneeded = function (e) {                                // change! - adding structure
            var objectStore = e.currentTarget.result.createObjectStore(
                     "eatThere", { keyPath: "id", autoIncrement: true }
                );
            objectStore.createIndex("name", "name", { unique: false });
            objectStore.createIndex("str", "str", { unique: false });
            objectStore.createIndex("ort", "ort", { unique: false });
            objectStore.createIndex("flag", "flag", { unique: false });

            for (i in eatThereData) {
                objectStore.add(eatThereData[i]);                               // adding all the data from var eatThereData
            }
       };
    }

    function contentLoaded() {

        initDb();               
                
                var btnPrint= document.getElementById("logo");/* 
                var btnDelete = document.getElementById("btnDelete");
                var btnAdd = document.getElementById("btnPrint");                
 
                btnAdd.addEventListener("click", function () {
                    var name = document.getElementById("txtName").value;
                    var adresse = document.getElementById("txtadresse").value;
 
                    var transaction = db.transaction("eatThere", 'readwrite');
                    var objectStore = transaction.objectStore("eatThere");                    
                    var request = objectStore.add({ name: name, adresse: adresse });
                    request.onsuccess = function (e) {
                        console.log(e);
                    };
                    request.error = function (e) {
                        console.log("FAIL ADD");
                    };
                }, false);
 
                btnDelete.addEventListener("click", function () {
                    var id = parseInt(document.getElementById("txtID").value);

                    console.log(id);
 
                    var transaction = db.transaction("eatThere", 'readwrite');
                    var objectStore = transaction.objectStore("eatThere");
                    var request = objectStore.delete(id);
                    request.onsuccess = function(e) {  
                        console.log(e); 
                    };
                    request.error = function (e) {
                        console.log("FAIL DELETE");
                    };
                }, false);
*/ 
                btnPrint.addEventListener("click", function () {
                var transaction = db.transaction("eatThere", 'readonly');
                    var objectStore = transaction.objectStore("eatThere");
 
                    var request = objectStore.openCursor();
                    request.onsuccess = function(e) {  
                        console.log("done PRINT");
                        var cursor = e.target.result;  
                        if (cursor) {  
                            console.log( "id: " + cursor.key + 
                                        " / name: " + cursor.value.name + "   -------------   " );                            
                            cursor.continue();  
                        }  
                        else {  
                            console.log("No more entries!");  
                        }  
                    };  
                    request.error = function (e) {
                        console.log("FAIL PRINT");
                    };

                }, false);              

            }


window.addEventListener("DOMContentLoaded", contentLoaded, false); 
}());