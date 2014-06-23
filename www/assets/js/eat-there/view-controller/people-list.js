'use strict';

window.eatThere = window.eatThere || {};

(function() {

    var Promise = window.eatThere.Promise;

    window.eatThere.PeopleListViewController = PeopleListViewController;

    function PeopleListViewController() {
        this.init('people');
        this.peopleStore = hoodie.store('people');
    }

    PeopleListViewController.prototype = window.eatThere.mix(
        window.eatThere._BaseViewController,
        {
            // overridden _BaseViewController methods
            
            fetchData: function fetchData(done) {
                var that     = this,
                    deferred = jQuery.Deferred();

                this.peopleStore
                    .findAll()
                    .then(function(people) {

                        people = people.sort(function(a, b) {
                            return a.name > b.name;
                        });

                        deferred.resolve({
                            viewName: that.viewName,
                            people:people
                        });
                    });
                

                return deferred.promise();
            },

            initBindings: function() {
                var that = this;

                this.viewNode.find('li').click(function(evnt) {
                    that.handlePeopleItemClicked(evnt);
                });

                this.viewNode.find('[data-js="create-person"]').keyup(function(evnt) {
                    var personName;

                    // on enter pressed
                    if(evnt.keyCode == 13) {
                        personName = $(evnt.target).val();

                        $(evnt.target).val(undefined);
                        console.log('YAYA!', evnt.target);
                        that.createPerson(personName);
                    }
                });

                hoodie.store.on('add:people', function() {
                    that.update();
                });
            },

            // helpers
            
            createPerson: function(personName) {
                this.peopleStore.add({name: personName});
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