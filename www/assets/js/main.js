/** ---------------------------------------------------------------------- */
/* @autor: Ola Gasidlo (o.gasidlo@gmail.com)
/* ----------------------------------------------------------------------- */
// initialize Hoodie


$(function() {

    var ENV_DEV  = 'dev',
        ENV_PROD = 'prod';

    var environment,
        logger,
        hoodie,
        $btn,
        $menu,
        $logo,
        $eatery,
        $stage,
        $item,
        hammertime;

// ---------- fcn - UI ------------------------------------
// --------------------------------------------------------

    function toggleMenu(){
        if(btn.hasClass('up')) {
            btn.removeClass('up').addClass('down');
        }
        else if(btn.hasClass('down')) {
            btn.removeClass('down').addClass('up');
        } 

        menu.toggleClass('hide');
    }

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



    /** ============== List edit Events ============== */

    // ------- line through item -------
    // ******* @ToDo add edit for flag (y/n)
    function toggleItem(){
        $(this).not(':first-child').toggleClass('strike');
    };


    // ------- edit item -------
    // ******* @ToDo add edit for storage
    function editItem() {
        logger.debug('\t--> editItem', this);

        var $listItem,
            animation,
            duration;

        $listItem = $(this);
        duration  = 600;

        if($listItem.hasClass('open')) {
            animation = {
                height: '-=200'
            };
        }
        else {
            animation = {
                height: '+=200'
            };
        }

        $listItem
            .animate(animation, duration)
            .toggleClass('open');
    }

    // ------- delete item -------
    // ******* @ToDo add delete of item in storage
    function deleteItem(){
        $(this).remove();
    }


    function initBindings() {
        logger.debug('\t --> initBindings');

        // ------- bind THIS SHIT! <3 ------- 
        $item.hammer().on('tap', toggleItem);
        $item.hammer().on('hold', editItem);
        $btn.bind('click', toggleMenu);

        // ******* @ToDo add dragright / dragleft event for mobiel

        hammertime.on("swipeleft", function(ev) {
          changeStage('right');
        });

        hammertime.on("swiperight ", function(ev) {
            changeStage('left');
        });

        Hammer(logo).on('tap',function(){
            if($eatery.hasClass('hide')){
                $eatery.fadeIn(500);
            } else {
                $eatery.fadeOut(500);
            }
        });
    }


    function initGlobals() {
        logger.debug('\t --> initGlobals');

        hoodie     = new Hoodie();
        $btn       = $('#menu');
        $menu      = $('menu ul');
        $logo      = $('#logo');
        $eatery    = $('#eatery');
        $stage     = $('#wrap');
        $item      = $('.stage ul li');
        hammertime = $stage.hammer();
    }

    function initLogger() {
        logger = {
            debug: function() {
                var args;

                if(environment === ENV_DEV) {
                    args = Array.prototype.slice.call(arguments, 0);
                    console.log.apply(console, args);
                }
            }
        };
    }


    function startApp() {
        environment = ENV_DEV;
        initLogger();

        logger.debug('Starting eatThere');
        initGlobals();
        initBindings();
    }


    startApp();

});

