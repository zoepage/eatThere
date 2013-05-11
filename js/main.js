
/** ---------------------------------------------------------------------- */
/* @autor: Ola Gasidlo (o.gasidlo@gmail.com)
/* ----------------------------------------------------------------------- */

var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB;
        var IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction;
        var db;

(function() {

// ---------- fcn - UI ------------------------------------
// ---------------------------------------------------------
    var stage   = jQuery('#stage');
    var btn     = jQuery('#btn');
    var menu    = jQuery('menu');
    var logo    = jQuery('#logo');

   btn.bind('click',function(){
        menu.toggleClass('hide');
   });

   logo.bind('click',function(){
       if(stage.hasClass('hide')){
            stage.removeClass("hide");
            stage.children().fadeIn(500);
       }
    });


// ---------- indexedDB ------------------------------------
// ---------------------------------------------------------

    /* ------------ test data --------- */
    var eatThereData = [
        { name: "Currybox", adresse: "Boxhagenerstr. 21", ort:"11245 Berlin", flag: "y" },
        { name: "Frittiersalon", adresse: "Boxhagenerstr. 128", ort:"11245 Berlin", flag: "n" },
        { name: "Zeus", adresse: "Boxhagenerstr. 19", ort:"11245 Berlin", flag: "n" },
        { name: "Bäcker", adresse: "Boxhagenerstr. 17", ort:"11245 Berlin", flag: "y" }
    ];

    function initDb() {
    /* ------- drop database -------
        var request = indexedDB.deleteDatabase("eatThereDB", 1);
        request.onsuccess = function (e) { alert('done');}
    */
        
        var request = indexedDB.open("eatThereDB", 1);                          //eatThere, Version 1 - open
        request.onsuccess = function (e) {                                      // done!
            db = request.result;                                                            
        };
        request.onerror = function (e) {                                        // fail!
            console.log("IndexedDB error: " + e.target.errorCode);
        };
        request.onupgradeneeded = function (e) {                                // change! - adding structure
            var objectStore = e.currentTarget.result.createObjectStore(
                     "eatThereDB", { keyPath: "id", autoIncrement: true }
                );
            objectStore.createIndex("name", "name", { unique: false });
            objectStore.createIndex("adresse", "adresse", { unique: false });
            objectStore.createIndex("ort", "ort", { unique: false });
            objectStore.createIndex("flag", "flag", { unique: false });

            for (i in eatThereData) {
                objectStore.add(eatThereData[i]);                               // adding all the data from var eatThereData
            }
       };
    }

    function contentLoaded() {
        initDb(); 

            //* ------------- get data from db -----------------
            var btnPrint = document.getElementById("logo"); 
            btnPrint.addEventListener("click", function () {
                var transaction = db.transaction("eatThereDB", 'readonly');
                var objectStore = transaction.objectStore("eatThereDB");
 
                //* ------------- count cursor's & give out a random one -----------------
                var request = objectStore.count();
                request.onsuccess = function(e) {  
                    var cursor      = e.target.result;
                    var r           = Math.floor((Math.random()*cursor)+1); 

                    var request = objectStore.openCursor(r);
                    request.onsuccess = function(e) {
                        var cursor      = e.target.result;

                        var title       = cursor.value.name;
                        var adr         = cursor.value.adresse;
                        var ort         = cursor.value.ort;
                        var eat         = jQuery("#eatery");

                        eat.find('span.title').text(title);
                        eat.find('span.str').text(adr);
                        eat.find('span.ort').text(ort);
                    };

                    request.error = function (e) {
                    var eat         = jQuery("#eatery");

                    eat.find('span.title').text("error");
                    eat.find('span.str').text("error");
                    eat.find('span.ort').text("error");
                    };
                };
                request.error = function (e) {
                    alert('DB.open did fail!');
                }; 

            }, false);              
                
            /* 
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
                             

     }


window.addEventListener("DOMContentLoaded", contentLoaded, false); 
}());