/** ---------------------------------------------------------------------- */
/* @autor: Ola Gasidlo (o.gasidlo@gmail.com)
/* ----------------------------------------------------------------------- */
// initialize Hoodie
var hoodie  = new Hoodie();


$(function() {

// ---------- fcn - UI ------------------------------------
// --------------------------------------------------------
    var btn     = $('#menu');
    var menu    = $('menu ul');
    var logo    = $('#logo');
    var eatery  = $('#eatery');
    var stage   = $('#wrap');

    function toggleMenu(){
        if(btn.hasClass('up')) {
            btn.removeClass('up').addClass('down');
        }
        else if(btn.hasClass('down')) {
            btn.removeClass('down').addClass('up');
        } 
        menu.toggleClass('hide');
    }

    btn.bind('click', toggleMenu);

    Hammer(logo).on('tap',function(){
       if(eatery.hasClass('hide')){
            eatery.fadeIn(500);
       } else {
        eatery.fadeOut(500);
       }
    });

    function changeStage(direction){
        var active = $('.active');
        var dirVar;
        var act = undefined;

        if(direction == 'right') {
            dirGo       = '-=100%';
            dirThere    = '+=100%';
            dirWhere    =  function nextStage(){
                if(active.next('.stage').hasClass('stage')) {
                    act = active.next(".stage");
                } 
                return act;
            };
        } else {
            dirGo       = '+=100%';
            dirThere    = '-=100%';
            dirWhere    =  function prevStage(){
                if(active.prev('.stage').hasClass('stage')) {
                    act = active.prev(".stage");
                } 
                return act;            
            };
        }

        if(dirWhere() !== undefined){
            active.animate({
                left: dirGo,
                right: 0
            }, 200, function() {
                    dirWhere().animate({
                        right: dirThere,
                        left: 0
                    }, 400, function(){
                        dirWhere().addClass('active');
                        active.removeClass('active');  
                    })
            });
        }

       
    }

    var hammertime = stage.hammer();

    // ******* @ToDo add dragright / dragleft event for mobiel

    hammertime.on("swipeleft", function(ev) {
      changeStage('right');
    });

    hammertime.on("swiperight ", function(ev) {
      changeStage('left');
    });


    /** ============== List edit Events ============== */

    var item = $('.stage ul li');


    // ------- line through item -------
    // ******* @ToDo add edit for flag (y/n)
    function toggleItem(){
        $(this).not(':first-child').toggleClass('strike');
    };


    // ------- edit item -------
    // ******* @ToDo add edit for storage
    function editItem(){
        that = $(this);

        if(that.hasClass('open')){
            that.animate({
                height: '-=200'
            }, 600, function(){});
        }  else  {
         that.animate({
                height: '+=200'
            }, 600, function(){});   
        }
          that.toggleClass('open'); 
    }

    // ------- delete item -------
    // ******* @ToDo add delete of item in storage
    function deleteItem(){
        $(this).remove();
    }


    // ------- bind THIS SHIT! <3 ------- 
    item.hammer().on('tap', toggleItem);
    item.hammer().on('hold', editItem);




});

