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
            // overridden _BaseViewController methods
            
            fetchData: function fetchData(done) {
                var that = this;
                
                // TODO: feed with real data
                setTimeout(function() {
                    done({
                        viewName: that.viewName,
                        people:[
                            {id: 11, name: 'Donna'},
                            {id: 22, name: 'Steven'},
                            {id: 33, name: 'Aaron'},
                            {id: 44, name: 'Frederick'}
                        ]
                    });
                }, 1);
            },

            initBindings: function() {
                var that = this;

                this.viewNode.find('li').click(function(evnt) {
                    that.handlePeopleItemClicked(evnt);
                });
            },

            // event handlers
            
            handlePeopleItemClicked: function(evnt) {
                var peopleItem,
                    peopleId,
                    peopleData;

                peopleItem = $(evnt.currentTarget);
                peopleId   = peopleItem.attr('data-id');
                peopleData = this.viewData.people.filter(function(o) { 
                    return o.id == peopleId; 
                })[0];

                console.log('clicked people item', peopleData);
            }
        }
    );

})();