
/** ---------------------------------------------------------------------- */
/* @autor: Ola Gasidlo (o.gasidlo@gmail.com)
/* ----------------------------------------------------------------------- */

(function() {
	
// ---------------- Liste ----------------
	// Items erledigt / nicht erledigt
	$('#list li').click(function(){
		$(this).toggleClass("done");
	});

}());