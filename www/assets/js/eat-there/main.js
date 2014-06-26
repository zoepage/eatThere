'use strict';

window.hoodie   = new Hoodie();
window.eatThere = window.eatThere || {};

$(function() {

    var ENV_DEV  = 'dev',
        ENV_PROD = 'prod';

    var environment,
        logger,
        views,
        viewOrder,
        startingViewName,
        currentViewName,
        people,
        eateries,
        $stage,
        $viewsWrapper,
        $eateryItem,
        $eateryItems,
        $peopleItems,
        $btn,
        $menu,
        $logo,
        $eatery,
        $addEatery,
        $addPerson,
        $item,
        $hammertime,
        hoodie;

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
    $addPerson    = $('#addPerson h2');
    $item         = $('.stage ul li');
    $hammertime   = $stage.hammer();

    // view/ui configuration
    
    views = {
        'people-view': new window.eatThere.PeopleListViewController(),
        'main-view':   new window.eatThere.StartscreenViewController(),
        'eatery-view': new window.eatThere.EateryListViewController(),
    };

    viewOrder = [
        'people-view',
        'main-view',
        'eatery-view',
    ];

    startingViewName = 'main-view';

    /* Helpers */

    function showView(viewName) {
        var $view,
            index;

        $view = views[viewName];
        index = viewOrder.indexOf(viewName);

        if(viewName != undefined && index > -1) {
            var css;

            css = {
                left:( ( -100 * index) + '%')
            };

            $viewsWrapper.css(css);
            $stage.attr('class', viewName);
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

    function fetchRandomEatery() {
        return eateries[Math.round(Math.random() * 9999999) % eateries.length];
    }

    function renderListData() {
        var $eateryList,
            $peopleList,
            $listNode;

        $eateryList = $eateryItems.parent();
        $peopleList = $peopleItems.parent();
        $listNode   = $('<li>');

        // people.forEach(function(person, idx, people) {
        //     $peopleList.append(
        //         $listNode.clone().html(person)
        //     );
        // });

        // eateries.forEach(function(eatery, idx, eateries) {
        //     $eateryList.append(
        //         $listNode.clone().html(eatery)
        //     );
        // });

    }

    /* Sort Helper */

    function orderStringsAscending(a, b) {
        var result;
        result = 0;

        if(a < b) {
            // a goes up
            result = -1;
        } else if(a > b) {
            // a goes down
            result = 1;
        }

        return result;
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

        // prevent click event on input
        if ($(evnt.target).hasClass('person-name')) {  
        } else { 

        $listItem
            .animate(animation, duration)
            .toggleClass('open');


        // @TODO save in var + small bug on first animation
        $listItem.find('div').fadeToggle(500);
}
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

    function handleLogoTap(evnt) {
        var randomEatery;

        console.log('randomEatery: ' + randomEatery);

        randomEatery = fetchRandomEatery();

        function fadeIn() {
            $eatery.find('.title').html(randomEatery);
            $eatery.fadeIn(500, function() {
                $(this).removeClass('hide');
            });
        }

        if($eatery.hasClass('hide')){
            fadeIn();
        } else {
            $eatery.fadeOut(250, fadeIn);
        }
    }

    // ------- delete item -------
    // ******* @ToDo add delete of item in storage
    function deleteItem(){
        $(this).remove();
    }

    // setup routines
    function initLogger() {
        window.eatThere.logger = {
            debug: function() {
                var args;

                if(environment === ENV_DEV) {
                    args = Array.prototype.slice.call(arguments, 0);
                    console.log.apply(console, args);
                }
            }
        };

        logger = window.eatThere.logger;
    }

    function initBindings() {
        logger.debug('\t--> initBindings');

        // @TODO: implement event with hoodie actions
        $eateryItems.hammer().on('tap', toggleItem);
        $btn.bind('click', toggleMenu);
        $hammertime.on("swipeleft",  handleStageSwipeLeft);
        $hammertime.on("swiperight", handleStageSwipeRight);

        Hammer($logo).on('touch', handleLogoTap);

        initMobileBindings();
    }

    function initMobileBindings() {
        logger.debug('\t--> initMobileBindings');

        // prevent ios webkit overscroll-effekt
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
            var view = views[viewName];

            view.setCss({
                left:((100 * idx) + '%')
            });

            view.update();
        });

        currentViewName = startingViewName;
        // renderListData();
        showView(currentViewName);
    }

    function initData() {

        // eateries = [
        //     'Thai',
        //     'Bäcker',
        //     'Currybox',
        //     'Happy Happy Ding Dong'
        // ];

        // people.sort(orderStringsAscending);
        // eateries.sort(orderStringsAscending);
    }

    function startApp() {
        environment = ENV_DEV;
        initLogger();

        logger.debug('Starting eatThere');

        initData();
        initUi();
        initBindings();
        initHoodieBindings();

        $('body').on('click.hoodie.data-api', '[data-hoodie-action]', function(evnt) {
            // @TODO: extract this as a seperate event handler
            var eventHandlers,
                action;

            eventHandlers = {
                'addEatery':handleEateryTitleHold,
                'addPerson':handleEateryTitleHold
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

