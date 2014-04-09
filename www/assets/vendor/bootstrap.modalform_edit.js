$(function() {  
  // make sure that only one modal is visible
  
  
    $modal = $('#login');

    $modal.on('submit', function(event){
      event.preventDefault();
      event.stopPropagation();

      var inputs = {};
      var $form = $(event.target);

      hoodie.account.signIn( $('#usr').val(), $('#pw').val() ).then(
          function(event, done) {
            window.location.href = 'index.html';    
      }, function(event, error) {
        $('.bd').prepend('<div class="alert alert-error">Username or password are wrong!<br /><br /> Please try again!</div>');
      });

      
    });

    hoodie.account.on('signin', function (user) {
       
    });

    hoodie.account.on('signout', function (user) {
       window.location.href = 'login.html';
    });


    hoodie.account.on('unauthenticated', function (user) { 
      alert('unautth') 
    });

    
    
    
});

