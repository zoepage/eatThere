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
        $stage,
        views,
        viewOrder,
        startingViewName,
        currentViewName,
        $eateryItem,
        $btn,
        $menu,
        $logo,
        $eatery,
        $addEatery,
        $item,
        hammertime;

    // init globals
    
    $stage        = $('#stage');
    $viewsWrapper = $('#views-wrapper');

    $eateryItems  = $('#eateries.list li')
    $peopleItems  = $('#people.list li')

    $btn          = $('#menu');
    $menu         = $('menu ul');
    $logo         = $('#logo');
    $eatery       = $('#eatery');
    $addEatery    = $('#addEatery');
    $item         = $('.stage ul li');
    hammertime    = $stage.hammer();

    // view/ui configuration
    
    views = {
        'people-view': $('#people-view'),
        'main-view':   $('#main-view'),
        'eatery-view': $('#eatery-view')
    };

    viewOrder = [
        'people-view',
        'main-view',
        'eatery-view'
    ];

    startingViewName = 'main-view';

    /* Helpers */

    function showView(viewName) {
        var $view,
            index;

        $view = views[viewName];
        index = viewOrder.indexOf(viewName);

        if(viewName != undefined && index > -1) {
            var css = {
                left:( ( -100 * index) + '%')
            };

            $viewsWrapper.css(css);
            $stage.attr('class', viewName);

            logger.debug('show ', viewName);
        }
    }

    function swipeLeft() {
        swipeToDirection(1);
    }

    function swipeRight() {
        swipeToDirection(-1);
    }

    function swipeToDirection(direction) {
        var minIndex,
            maxIndex,
            tempIndex,
            nextIndex;

        minIndex  = 0;
        maxIndex  = viewOrder.length - 1;
        tempIndex = viewOrder.indexOf(currentViewName);

        // figure if stage is in a valid state
        if(tempIndex > -1) {

            // apply swipe direction to viewOrder index
            tempIndex += direction;

            // correct boundaries if necessary
            if(tempIndex < minIndex) {
                tempIndex = minIndex;
            }
            if(tempIndex > maxIndex) {
                tempIndex = maxIndex;
            }

            // allow index change
            nextIndex = tempIndex;
        }

        if(nextIndex !== undefined) {
            // if a valid nextIndex is given, apply viewstate
            currentViewName = viewOrder[nextIndex];
            showView(currentViewName);
        }
    }


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

    function handleStageSwipeLeft(evnt) {
        swipeLeft();
    }

    function handleStageSwipeRight(evnt) {
        swipeRight();
    }

    // ------- delete item -------
    // ******* @ToDo add delete of item in storage
    function deleteItem(){
        $(this).remove();
    }

    // setup routines
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

    function initBindings() {
        logger.debug('\t--> initBindings');

        // @TODO: implement event with hoodie actions
         $eateryItems.hammer().on('tap', toggleItem);

        $btn.bind('click', toggleMenu);

        // ******* @ToDo add dragright / dragleft event for mobiel
        hammertime.on("swipeleft",  handleStageSwipeLeft);
        hammertime.on("swiperight", handleStageSwipeRight);

        if($logo != undefined) {
          Hammer($logo).on('tap',function(){
               if($eatery.hasClass('hide')){
                    $eatery.fadeIn(500);
                } else {
                    $eatery.fadeOut(500);
                }
            });
        } 

        initMobileBindings();
    }

    function initMobileBindings() {
        logger.debug('\t--> initMobileBindings');

        $(document).on('touchmove', function(evnt) {
            evnt.preventDefault();
        });
    }

    function initHoodieBindings() {
        logger.debug('\t--> initHoodieBindings');

        window.hoodie.account.on('signout', function (user) {
            window.location.href = 'login.html';
        });

        window.hoodie.account.on('unauthenticated', function (user) {
            window.location.href = 'login.html';
        });

        window.hoodie.account.on('signin', function (user) {
            $('html').attr('data-hoodie-account-status', 'signedin');
            $('.hoodie-accountbar').find('.hoodie-username').text(username).attr('color', 'red');
            alert('DRIN');
        });
    }

    function initUi() {
        logger.debug('\t--> initUi');

        var cssConfig;

        viewOrder.forEach(function(viewName, idx, viewNames) {
            views[viewName].css({
                left:((100 * idx) + '%')
            })
        });

        currentViewName = startingViewName;
        showView(currentViewName);
    }

    function startApp() {
        environment = ENV_DEV;
        initLogger();

        logger.debug('Starting eatThere');

        initUi();
        initBindings();
        initHoodieBindings();

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

