(function() {

    window.eatThere.models = window.eatThere.models || {};

    var People = function () {
      // @TODO: unmock and loosely wire adapter. 
      this.setAdapter('hoodie');

      this.defineProperties({
        name:       { type: 'string', required: true },
        isInvolved: { type: 'boolean', required: true }
      });
    };
    People = window.geddy.model.register('People', People);

    // object methods
    
    People.createPerson = function createPerson(person) {
        var deferred = jQuery.Deferred(),

        person = People.create(person);

        person.save(function(err, person) {
            deferred.resolve(person);
        });

        debugger;

        return deferred.promise();
    };

    window.eatThere.models.People = People;

})();
