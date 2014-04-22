'use strict';

window.eatThere = window.eatThere || {};

(function() {

    var Promise = window.eatThere.Promise;

    window.eatThere.PeopleListViewController = PeopleListViewController;

    function PeopleListViewController() {
        this.init('people');
    }

    PeopleListViewController.prototype = window.eatThere.mix(
        window.eatThere._BaseViewController,
        {
            fetchData: function fetchData(done) {
                var that = this;
                
                // TODO: feed with real data
                setTimeout(function() {
                    done({
                        viewName: that.viewName,
                        people:[
                            {name: 'Donna'},
                            {name: 'Steven'},
                            {name: 'Aaron'},
                            {name: 'Frederick'}
                        ]
                    });
                }, 1);
            }
        }
    );

})();