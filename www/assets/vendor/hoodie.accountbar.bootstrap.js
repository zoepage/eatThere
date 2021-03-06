!function ($) {

  'use strict';

  // extend Hoodie with Hoodstrap module
  Hoodie.extend(function(hoodie) {

    // Constructor
    function Hoodstrap(hoodie) {

      this.hoodie = hoodie;

      // all about authentication and stuff
      this.hoodifyAccountBar();
    }

    Hoodstrap.prototype = {

      //
      hoodifyAccountBar: function() {
        this.subscribeToHoodieEvents();
        this.hoodie.account.authenticate().then(this.handleUserAuthenticated.bind(this), this.handleUserUnauthenticated.bind(this));
      },

      subscribeToHoodieEvents : function() {
        this.hoodie.account.on('signin reauthenticated', this.handleUserAuthenticated.bind(this));
        this.hoodie.account.on('signout', this.handleUserUnauthenticated.bind(this));
        this.hoodie.on('account:error:unauthenticated remote:error:unauthenticated', this.handleUserAuthenticationError.bind(this));
      },

      //
      handleUserAuthenticated: function(username) {
        $('html').attr('data-hoodie-account-status', 'signedin');
        $('.hoodie-accountbar').find('.hoodie-username').text(username);
      },

      //
      handleUserUnauthenticated: function() {
        $('html').attr('data-hoodie-account-status', 'signedout');
      },
      handleUserAuthenticationError: function() {
        $('.hoodie-accountbar').find('.hoodie-username').text(this.hoodie.account.username);
        $('html').attr('data-hoodie-account-status', 'error');
      }
    };

    new Hoodstrap(hoodie);
  });

 /* Hoodie DATA-API
  * =============== */

  $(function () {

    // bind to click events
    $('body').on('click.hoodie.data-api', '[data-hoodie-action]', function(event) {
      var $element = $(event.target),
          action   = $element.data('hoodie-action'),
          $form;

      switch(action) {
        
        case 'signout':
          window.hoodie.account.signOut();
          break;
        
      }

      if ($form) {
        $form.on('submit', handleSubmit( action ));
      }
    });

    var handleSubmit = function(action) {
      return function(event, inputs) {

        var $modal = $(event.target);
        var magic;

        switch(action) {
          case 'signin':
            magic = window.hoodie.account.signIn(inputs.username, inputs.password);
            break;
          case 'signup':
            magic = window.hoodie.account.signUp(inputs.username, inputs.password);
            break;
          case 'changepassword':
            magic = window.hoodie.account.changePassword(null, inputs.new_password);
            break;
          case 'changeusername':
            magic = window.hoodie.account.changeUsername(inputs.current_password, inputs.new_username);
            break;
          case 'resetpassword':
            magic = window.hoodie.account.resetPassword(inputs.email)
            .done(function() {
              window.alert('send new password to ' + inputs.email);
            });
            break;
        }


      };
    };
  });
}( window.jQuery )