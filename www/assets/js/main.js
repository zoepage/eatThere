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
        $addEatery,
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

    function animateBackground(direction) {
        var wrapStates,
            statePointer,
            stateClass;

        wrapStates = [
            'people',
            'startscreen',
            'eatery',
        ];

        stateClass = $('#wrap').attr('class');
        if(wrapStates.indexOf(stateClass) > -1) {
            statePointer = wrapStates.indexOf(stateClass);
        }

        if(direction == 'left') {
            statePointer--;
            if(statePointer < 0) {
                statePointer = 0;
            }
        } else if(direction == 'right') {
            statePointer++;
            if(statePointer > (wrapStates.length-1)) {
                statePointer = wrapStates.length - 1;
            }
        }


        $('#wrap').attr('class', wrapStates[statePointer]);
    }

    function changeStage(direction){
        var active,
            dirVar,
            act;


        animateBackground(direction);

        active = $('.active');

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

        // @TODO save in var + small bug on first animation
        $('form').fadeToggle(500);


         // @TODO save in var and clean up 
        $addEatery.keypress(function(e){
           if(e.which == 13){
                attributes = {title: e.target.value};
                hoodie.store.add('eatery', attributes); // insert valid JSON
           }
        });
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

        if($logo != undefined) {
          Hammer($logo).on('tap',function(){
               if($eatery.hasClass('hide')){
                    $eatery.fadeIn(500);
                } else {
                    $eatery.fadeOut(500);
                }
            });
        } 
    }


    function initGlobals() {
        logger.debug('\t--> initGlobals');

        $eateryItem = $('#eateryView li ')

        $btn       = $('#menu');
        $menu      = $('menu ul');
        $logo      = $('#logo');
        $eatery    = $('#eatery');
        $addEatery    = $('#addEatery');
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

        window.hoodie.account.on('signout', function (user) {
            window.location.href = 'login.html';
        });

        window.hoodie.account.on('unauthenticated', function (user) {
            window.location.href = 'login.html';
        });

    }



    // pseudo main

    startApp();

});

