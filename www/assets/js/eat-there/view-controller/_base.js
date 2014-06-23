'use strict';

window.eatThere = window.eatThere || {};

(function() {

    var Promise = window.eatThere.Promise;

    window.eatThere._BaseViewController = {
        init: function init(viewName) {
            var that          = this;

            this.viewName     = viewName
            this.viewSelector = '[data-view=' + this.viewName +']';
            this.viewNode     = $(this.viewSelector);
            this.template     = this.viewNode.find('.template').html();
        },

        initBindings: function initBindings() {

        },

        setCss: function setCSS(config) {
            this.viewNode.css(config);
        },

        fetchData: function fetchData() {
            var that,
                deferred;

            that     = this;
            deferred = jQuery.Deferred();

            // TODO: feed with real data
            setTimeout(function() {
                deferred.resolve({
                    viewName: this.viewName
                })
            }, 1);

            return deferred.promise();
        },

        render: function render() {

            this.viewHtml = Mustache.render(this.template, this.viewData);
            this.viewNode.html(this.viewHtml);

            this.initBindings();
        },

        update: function update() {
            var that = this;

            this.fetchData()
                .then(function(data) {
                    that.viewData = data;
                    that.render();
                });
        }
    };

})();
