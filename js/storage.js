
/** ---------------------------------------------------------------------- */
/* @autor: Ola Gasidlo (o.gasidlo@gmail.com)
/* ----------------------------------------------------------------------- */

(function() {
	
	// Variablen deklarieren
	var form 		= $('#newTask');
	var input 		= $('input#task');
	var list 		= $('ul');
	var firstItem 	= $('ul li:first');
	var lastItem 	= $('ul li:last');
	i = 0;


	// ---------------- Laden der Seite ----------------
	// Storage auslesen beim laden der Seite, wenn es einen Storage gibt
	if (localStorage.length > 0){
			L = localStorage.length;
			$('li').remove();
		
		for(i = 1; i <= L; i++){
			text = localStorage.getItem(i);
			list.append('<li>' + text + '</li>');
		}

	} else {
		list.append('<li class="noItems"> Es wurden noch keine Items eingetragen.</li>');
	}




	// ---------------- Buttons ----------------
	// NEW
	$('#new').bind('click', function(){
		form.toggleClass("hide");
	});

	form.submit(function(){
		form.toggleClass("hide");
		$('li.noItems').remove();

		var vI = input.val();
		localStorage.setItem(localStorage.length + 1, vI);

		list.append('<li>' + vI + '</li>').fadeIn(500);
		$('ul li:last').on("click", function(){
				$(this).toggleClass("done");
		});		
		input.val("");
	});

	// REMOVE
	$('#remove').bind('click', function(){
		$('li').each( function(){
			i++;
			t = $(this);
			if(t.hasClass('done')){
				t.remove();
				};

		});

		localStorage.clear();
		$( "li" ).each(function( idx ) {
			text 	= $(this).text();
			idx 	= idx + 1;


			localStorage.setItem(idx, text);
		
  		 console.log( idx + ": "  );
		});
	});


	// CLEAR
	$('#clear').bind('click', function(){
		localStorage.clear();
		$('li').remove();
		list.append('<li class="noItems"> Es wurden noch keine Items eingetragen.</li>');
	});
}());
