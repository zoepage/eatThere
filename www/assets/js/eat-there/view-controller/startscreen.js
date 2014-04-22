'use strict';

window.eatThere = window.eatThere || {};

(function() {

    window.eatThere.StartscreenViewController = StartscreenViewController;

    function StartscreenViewController() {
        this.init('startscreen');
    }

    StartscreenViewController.prototype = window.eatThere._BaseViewController;

})();

