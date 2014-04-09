/** ---------------------------------------------------------------------- */
/* @autor: Ola Gasidlo (o.gasidlo@gmail.com)
/* ----------------------------------------------------------------------- */

window.hoodie = new Hoodie();

$(function() {

    var ENV_DEV  = 'dev',
        ENV_PROD = 'prod';

    var environment,
        logger,
        hoodie,
        $eateryItem,
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

    function handleEateryTitleHold(evnt) {
        logger.debug('\t--> handleEateryTitleHold');

        var $listItem,
            animation,
            duration;

        $listItem = $(evnt.currentTarget);
        duration  = 600;

        if($listItem.hasClass('open')) {
            animation = {
                height: '-=100'
            };
        }
        else {
            animation = {
                height: '+=100'
            };
        }

        $listItem
            .animate(animation, duration)
            .toggleClass('open');

        // @TODO save in var
        $('form').toggleClass('hide');


         // @TODO save in var and clean up and make it work :D
        document.getElementById('addEatery').onkeydown = function(e){
           if(e.keyCode == 13){
            alert($('addEatery').value);
              hoodie.store.add('eatery', $('addEatery').value);
           }
        };
    }

    function handleEateryItemHold(evnt) {
        logger.debug('\t--> handleEateryItemHold');
        handleEateryTitleHold(evnt);
    }

    // ------- delete item -------
    // ******* @ToDo add delete of item in storage
    function deleteItem(){
        $(this).remove();
    }

    function initBindings() {
        logger.debug('\t--> initBindings');

        // @TODO: implement event with hoodie actions
         $eateryItem.hammer().on('tap', toggleItem);

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
        logger.debug('\t--> initGlobals');

        $eateryItem = $('#eateryView li ')

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

        $('body').on('click.hoodie.data-api', '[data-hoodie-action]', function(evnt) {
            // @TODO: extract this as a seperate event handler
            var eventHandlers,
                action;

            eventHandlers = {
                'addEatery':handleEateryTitleHold
            }
            action = $(this).attr('data-hoodie-action');

            if(typeof eventHandlers[action] === 'function') {
                eventHandlers[action](evnt);
            }
        });
    }

    // pseudo main

    startApp();

});

