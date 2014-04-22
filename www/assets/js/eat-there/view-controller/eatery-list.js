'use strict';

window.eatThere = window.eatThere || {};

(function() {
    var Promise = window.eatThere.Promise;

    window.eatThere.EateryListViewController = EateryListViewController;

    function EateryListViewController() {
        this.init('eateries');
    }

    EateryListViewController.prototype = window.eatThere.mix(
        window.eatThere._BaseViewController,
        {
            fetchData: function fetchData(done) {
                var that = this;

                // TODO: feed with real data
                setTimeout(function() {
                    done({
                        viewName: that.viewName,
                        eateries:[
                            {name: 'McDonalds'},
                            {name: 'Burgerking'},
                            {name: 'Foo-Bar'},
                            {name: 'Ikea'}
                        ]
                    });
                }, 1);
            }
        }
    );

})();

