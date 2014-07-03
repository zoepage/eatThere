(function() {

    window.eatThere.models = window.eatThere.models || {};

    var People = function () {
      // @TODO: unmock and loosely wire adapter. 
      this.setAdapter('memory');

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

        return deferred.promise();
    };

    People.allAscendingByName = function allAscendingByName() {
      var deferred = jQuery.Deferred();

      People.all(function(err, people) {
          people = people.sort(function(a, b) {
              var direction = 0,
                  aName     = a.name.toLowerCase(),
                  bName     = b.name.toLowerCase();

              if(aName < bName) {
                  direction = -1;
              } else if(aName > bName) {
                  direction = 1;
              }

              return direction;
          });

          deferred.resolve(people);
      });

      return deferred.promise()
    };

    window.eatThere.models.People = People;

})();
