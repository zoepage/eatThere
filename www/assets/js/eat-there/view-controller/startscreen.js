'use strict';

window.eatThere = window.eatThere || {};

(function() {

    var Eatery = window.eatThere.models.Eatery;

    function StartscreenViewController() {
        this.init('startscreen');
    }

    StartscreenViewController.prototype = window.eatThere.mix(
        window.eatThere._BaseViewController,
        {
        	initBindings: function initBindings() {
        		var that = this;

				this.viewNode.hammer('#logo').on('click', function() {
					that.handleLogoTap();
				});
        	},
        	handleLogoTap: function() {
		        var randomEatery,
		        	$eatery;

		        $eatery = this.viewNode.find('#eatery');

		        Eatery.getRandomEatery().then( function(randomEatery){

		            function fadeIn() {
		                $eatery.find('.title').html(randomEatery.title);
		                $eatery.fadeIn(500, function() {
		                    $(this).removeClass('hide');
		                });
		            }

		            if($eatery.hasClass('hide')){
		                fadeIn();
		            } else {
		                $eatery.fadeOut(250, fadeIn);
		            }

		        });
        	}
    });

    window.eatThere.StartscreenViewController = StartscreenViewController;

})();

