(function() {

    window.eatThere.models = window.eatThere.models || {};

    var Eatery = function () {
      // @TODO: unmock and loosely wire adapter. 
      this.setAdapter('memory');

      this.defineProperties({
        title       :   { type: 'string', required: true },
        adress      :   { type: 'string', required: false },
        isWanted    :   { type: 'boolean', required: true }
      });
    };
    Eatery = window.geddy.model.register('Eatery', Eatery);

    // object methods
    
    Eatery.createEatery = function createEatery(eatery) {
        var deferred = jQuery.Deferred(),

        eatery = Eatery.create(eatery);

        eatery.save(function(err, eatery) {
            deferred.resolve(eatery);
        });

        return deferred.promise();
    };

    Eatery.allAscendingByName = function allAscendingByName() {
      var deferred = jQuery.Deferred();

      Eatery.all(function(err, eatery) {
          eatery = eatery.sort(function(a, b) {
              var direction = 0,
                  aName     = a.title.toLowerCase(),
                  bName     = b.title.toLowerCase();

              if(aName < bName) {
                  direction = -1;
              } else if(aName > bName) {
                  direction = 1;
              }

              return direction;
          });

          deferred.resolve(eatery);
      });

      return deferred.promise();
    };

    Eatery.getRandomEatery = function getRandomEatery(){
      var deferred = jQuery.Deferred();

      Eatery.all(function(err, eateries) {

        eateries = eateries.filter( function(e) {
          return e.isWanted == true;
        });

          var eatery = eateries[Math.round(Math.random() * 9999999) % eateries.length];
          

          deferred.resolve(eatery);
      });
      return deferred.promise();
    };

    window.eatThere.models.Eatery = Eatery;

})();
