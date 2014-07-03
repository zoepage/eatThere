(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var BaseAdapter
  , configPropertyAliases
  , EventEmitter = require('events').EventEmitter
  , model = require('../index')
  , adapter = require('./index')
  , utils = require('utilities');

configPropertyAliases = [
  ['user', 'username', 'userName']
, ['pass', 'password']
, ['database', 'dbname', 'db', 'dbName']
, ['host', 'hostname', 'hostName']
];

BaseAdapter = function () {
};

BaseAdapter.prototype = new EventEmitter();
utils.mixin(BaseAdapter.prototype, new (function () {

  this.loadConfig = function (baseConfig, options) {
    var base = utils.mixin({}, baseConfig)
      , opts = utils.mixin({}, options || {})
      , found
      , aliasKeys
      , aliasKey;
    // If there's a property name on the passed in opts that is
    // an alias for a property on the config, set the correct
    // property name and delete the alias
    for (var p in base) {
      // Is this possibly an aliased property?
      found = configPropertyAliases.some(function (aliases) {
        aliasKeys = aliases;
        return aliases.indexOf(p) > -1;
      });
      if (found) {
        // Does the opts obj have an aliased keys?
        found = aliasKeys.some(function (alias) {
          aliasKey = alias;
          // Possible key isn't the same as the real key
          // Key has a defined value on the opts obj
          return alias != p && typeof opts[alias] != 'undefined';
        });
        if (found) {
          opts[p] = opts[aliasKey];
          delete opts[aliasKey]
        }
      }
    }
    return utils.mixin(base, opts);
  };

  this.connect = function (callback) {
    var self = this
      , cb = callback || function () {};
    setTimeout(function () {
      self.emit('connect');
      cb();
    }, 0);
  };

  this.disconnect = function (callback) {
    var self = this
      , cb = callback || function () {};
    setTimeout(function () {
      self.emit('disconnect');
      cb();
    }, 0);
  };

  this.load = function (query, callback) {
    callback(null, []);
  };

  this.update = function (data, query, callback) {
    if (data instanceof model.ModelBase) {
      callback(null, data);
    }
    else {
      callback(null, true);
    }
  };

  this.remove = function (query, callback) {
    callback(null, true);
  };

  this.insert = function (data, opts, callback) {
    data.id = data.id || utils.string.uuid()
    data._saved = true;
    callback(null, data);
  };

  this.count = function (query, callback) {
    callback(null, 0);
  };

  this.createTable = function (names, callback) {
    callback(null, null);
  };

  this.dropTable = function (names, callback) {
    callback(null, null);
  };

})());

module.exports.BaseAdapter = BaseAdapter;

},{"../index":11,"./index":3,"events":40,"utilities":25}],2:[function(require,module,exports){
// hoodie adapter
var model = require('../../index')
  , utils = require('utilities')
  , mr = require('../transformers/mr')
  , operation = require('../../query/operation')
  , comparison = require('../../query/comparison')
  , datatypes = require('../../datatypes')
  , request = utils.request
  , BaseAdapter = require('../base_adapter').BaseAdapter
  , _baseConfig
  , _data = {};

_baseConfig = {};

var Adapter = function (options) {
  var opts = options || {}
    , config;

  this.name = 'hoodie';
  this.config = this.loadConfig(_baseConfig, opts);
  this.client = null;

  this.init.apply(this, arguments);
};

Adapter.prototype = new BaseAdapter();
Adapter.prototype.constructor = Adapter;

function _itemMatchesQuery(item, query) {
  var conditionKeys = Object.keys(query.rawConditions),
      foundMatch    = false,
      key;

  for(idx = 0; idx < conditionKeys.length && !foundMatch; idx++) {
    key = conditionKeys[idx]
    foundMatch = query.rawConditions[key] === item[key] && item.hasOwnProperty(key);
  }

  return foundMatch;
}

function _filterByProperties(data, properties) {
  var obj = {};

  Object.keys(properties).forEach(function(key) {
    obj[key] = data[key];
  });

  return obj;
}

utils.mixin(Adapter.prototype, new (function () {

  this._getDatastore = function (storeName) {
    // @TODO: figure wheter to operate on backend or frontend store
    return hoodie.store(storeName);
  };

  this.init = function () {};

  this.load = function (query, callback) {
    // @TODO: implement complex query operands
    // @TODO: implement limits
    // @TODO: implement validation
    
    var modelName = query.model.modelName
      , storeName = modelName.toLowerCase()
      , datastore = this._getDatastore(storeName)
      , props     = model.descriptionRegistry[modelName].properties
      , limit     = query.opts.limit
      , res       = [];

      datastore.findAll()
        .then(function(items) {
          var conditionKeys = Object.keys(query.rawConditions);

          // if a query object is given
          if(conditionKeys.length > 0) {
            items = items.filter(function(item) {
              return _itemMatchesQuery(item, query);
            });
          }

          // in all cases wrap raw data results 
          // into model instances
          res = items.map(function(item) {
            return query.model.create(item, {scenario: query.opts.scenario})
          });

          // query a single one

          if(query.opts && query.opts.limit === 1) {
            res = res[0];
          }
          callback(null, res);
        });
  };

  this.update = function (data, query, callback) {
    var datastore = this._getDatastore()
      , key = query.model.modelName
      , id = query.byId
      , ids;

    // Lazy-create the collection
    if (!datastore[key]) {
      datastore[key] = {};
    }

    if (id) {
      ids = [id];
    }
    else {
      ids = query.rawConditions.id;
      // Mapreduce for the list of ids
      if (!ids) {
        ids = [];
        this.load(query, function (err, items) {
          if (err) {
            callback(err, null);
          }
          else {
            items.forEach(function (item) {
              ids.push(item.id);
            });
          }
        });
      }
    }
    ids.forEach(function (id) {
      var item = model[key].create(datastore[key][id]);
      item.updateProperties(data);
      datastore[key][id] = item;

    });
    if (data instanceof model.ModelBase) {
      this._writeDatastore(datastore);
      callback(null, data);
    }
    else {
      this._writeDatastore(datastore);
      callback(null, true);
    }
  };

  this.remove = function (query, callback) {

    var modelName = query.model.modelName
      , storeName = modelName.toLowerCase()
      , datastore = this._getDatastore(storeName)
      , id        = query.byId
      , ids;

    if (id) {
      ids = [id];
    }
    else {
      ids = query.rawConditions.id;
      // Mapreduce for the list of ids
      if (!ids) {
        ids = [];
        this.load(query, function (err, items) {
          if (err) {
            callback(err, null);
          }
          else {
            items.forEach(function (item) {
              ids.push(item.id);
            });
          }
        });
      }
    }

    (function removeAll(ids) {
      var id;

      if(ids.length === 0) {
        callback(null, true);
      } else {
        id = ids.pop()
        datastore.remove(id).then(function() {
          removeAll(ids);
        });
      }
    })(ids);

  };

  this.insert = function (data, opts, callback) {
    // @TODO validation checks
    var items     = Array.isArray(data) ? data.slice() : [data]
      , modelName = items[0].type
      , storeName = modelName.toLowerCase()
      , datastore = this._getDatastore(storeName)
      , props     = model.descriptionRegistry[modelName].properties;

    data = _filterByProperties(data, props);
    datastore.add(data).then(function(data) {
      callback(null, data);
    });
  }

})());

utils.mixin(Adapter.prototype, mr);

module.exports.Adapter = Adapter;


},{"../../datatypes":8,"../../index":11,"../../query/comparison":14,"../../query/operation":15,"../base_adapter":1,"../transformers/mr":5,"utilities":25}],3:[function(require,module,exports){
(function (__dirname){

var adapters
  , path = require('path')
  , _aliases
  , _adapters
  , _paths;

_aliases = {
  postgres: 'postgres'
, pg: 'postgres'
, postgresql: 'postgres'
, mysql: 'mysql'
, sqlite: 'sqlite'
, riak: 'riak'
, mongo: 'mongo'
, mongodb: 'mongo'
, memory: 'memory'
, filesystem: 'filesystem'
, level: 'level'
};

_adapters = {
  postgres: {
    path: 'sql/postgres'
  , lib: 'pg'
  , type: 'sql'
  }
, mysql: {
    path: 'sql/mysql'
  , lib: 'mysql'
  , type: 'sql'
  }
, sqlite: {
    path: 'sql/sqlite'
  , lib: 'sqlite3'
  , type: 'sql'
  }
, riak: {
    path: 'riak/index'
  , lib: null
  , type: 'nosql'
  }
, mongo: {
    path: 'mongo/index'
  , lib: 'mongodb'
  , type: 'nosql'
  }
, memory: {
    path: 'memory/index'
  , lib: null
  , type: 'nosql'
  }
, filesystem: {
    path: 'filesystem/index'
  , lib: null
  , type: 'nosql'
  }
, level: {
    path: 'level/index'
  , lib: 'level'
  , type: 'nosql'
  }
};

for (var p in _adapters) {
  _adapters[p].name = p;
}

adapters = new (function () {

  this.getAdapterInfo = function (adapter) {
    var canonical = _aliases[adapter]
      , adapter = _adapters[canonical];
    return adapter || null;
  };

  this.create = function (name, config) {
    var info = this.getAdapterInfo(name)
      , ctorPath
      , ctor;

    if (!info) {
      throw new Error('"' + name + '" is not a valid adapter.');
    }

    ctorPath = path.join(__dirname, info.path)
    // "/lib/adapters/level/index"
    // ctor = require(ctorPath).Adapter;
    ctor = require('./hoodie/index').Adapter;

    return new ctor(config || {});
  };

})();

module.exports = adapters;

}).call(this,"/../lib/adapters")
},{"./hoodie/index":2,"path":47}],4:[function(require,module,exports){

var BaseTransformer = function () {
};

BaseTransformer.prototype = new (function () {

  this.tranformSortOrder = function () {};

  this.tranformConditions = function () {};

  this.transformOperation = function () {};

  this.transformComparison = function () {};

  this.transformComparisonFieldName = function () {};

  this.transformComparisonComparator = function () {};

  this.transformComparisonValue = function () {};

})();

module.exports.BaseTransformer = BaseTransformer;

},{}],5:[function(require,module,exports){
var BaseTransformer = require('./base_transformer').BaseTransformer
  , utils = require('utilities')
  , operation = require('../../query/operation')
  , comparison = require('../../query/comparison')
  , datatypes = require('../../datatypes');

var mr = utils.mixin(new BaseTransformer(), new (function () {

  var _transformForDataType = function (datatype, val, nocase) {
        var ret;
        switch (true) {
          case val === null:
            ret = 'null';
            break;
          case val === '':
            ret = '\'\'';
            break;
          case datatype == 'date' || datatype == 'datetime':
            if (this.name == 'riak' || this.name == 'level') {
              ret = JSON.stringify(val).replace(/"/g, "'");
            }
            else {
              // might be a date-string,
              // so try to convert it to a date object
              if (typeof val === 'string') {
                val = new Date(val);
              }

              ret = val.getTime();
            }
            break;
          default:
            if (nocase) {
              val = val.toLowerCase();
            }

            ret = datatypes[datatype].serialize(val, {
                useQuotes: true
              , escape: 'js'
            });
        }
        return ret;
      }

    // This function is special -- its source is transformed by
    // replacing the __sort__ variable. It's also converted into
    // a JSON-safe string in the Riak adapter and posted as the
    // reduce-sort
    , _sortFunction = function (values) {
        // Dummy value to replace with real sort data -- will look
        // like {'foo': 'asc', 'bar': 'desc'}
        var sort = '__sort__'
        // Directional sort, returns explicit zero if equal
          , baseSort = function (a, b, dir) {
            if (a == b) {
              return 0;
            }
            if (dir == 'asc') {
              return a > b ? 1 : -1;
            }
            else {
              return a > b ? -1 : 1;
            }
          }
        // Iterates each of the sort columns until it finds a
        // pair of values that are not the same
        , columnSort = function (a, b) {
            var ret;
            for (var p in sort) {
              // Call the directional sort for the two values
              // in this property
              ret = baseSort(a[p], b[p], sort[p]);
              // -1 and 1 are truthy
              if (ret) {
                return ret;
              }
            }
            return 1;
          };
        return values.sort(columnSort);
      }

    , _operationSymbols = {
        'and': '&&'
      , 'or': '||'
      };

  this.transformSortOrder = function (sort) {
    var sortString
      , sortSource;

    if (!sort) {
      return null;
    }

    sortString = JSON.stringify(sort).replace(/"/g, "'")
    sortSource = _sortFunction.toString()
        // Strip comments
        .replace(/\/\/.*(\n)|\/\/.*(\r)/g, '')
        // Strip linebreaks
        .replace(/\n|\r/g, ' ')
        // Reduce multiple spaces to single space
        .replace(/ {2,}/g, ' ')
        // Replace placeholder with real sort, e.g., {'foo': 'asc'}
        .replace('\'__sort__\'', sortString);

    // Get the function body
    sortSource = sortSource.replace('function (values) { ', '');
    sortSource = sortSource.substr(0, sortSource.length - 1);

    return new Function('values', sortSource);
  };

  this.transformConditions = function (conditions) {
    var cond = this.transformOperation(conditions);
    return cond;
  };

  this.transformOperation = function (op) {
    var self = this
      , ops = [];
    if (op.isEmpty()) {
      return '(true)';
    }
    else {
      op.forEach(function (o) {
        if (o instanceof operation.OperationBase) {
          ops.push(self.transformOperation(o));
        }
        else {
          ops.push(self.transformComparison(o));
        }
      });
      if (op.type == 'not') {
        return '(!(' + self.transformOperation(op.operand()) + '))';
      }
      else {
        return '(' + ops.join(' ' + _operationSymbols[op.type.toLowerCase()] +
            ' ') + ')';
      }
    }
  };

  this.transformComparison = function (comp) {
    var ret = ''
      , name = this.transformComparisonFieldName(comp)
      , arr = []
      , val = comp.value
      , tempVal = []
      , startsWithWildcard
      , endsWithWildcard
      , nocase = comp.opts.nocase;

    switch (true) {
      case comp instanceof comparison.LikeComparison:
        startsWithWildcard = val.charAt(0) == '%';
        endsWithWildcard = val.charAt(val.length - 1) == '%';

        val = val.split('%');

        // Replace all percents that aren't endcaps with .*,
        // everything else with escaped strings
        for(var i in val) {
          if(val[i] != '') {
            tempVal.push(utils.string.escapeRegExpChars(val[i]));
          }
        }

        val = tempVal.join('.*');

        // Tack on anchors if needed
        if(startsWithWildcard && !endsWithWildcard) {
          val = val + '$';
        }

        if(!startsWithWildcard) {
          val = '^' + val;
        }

        if(nocase) {
          ret = name + '.match(/' + val + '/i) !== null';
        }
        else {
          ret = name + '.match(/' + val + '/) !== null';
        }
        break;
      case comp instanceof comparison.InclusionComparison:
        // Handles <fieldname> in []
        if(comp.value.length) {
          comp.value.forEach(function (item) {
            arr.push(name + ' == ' +
                _transformForDataType.apply(this, [comp.datatype, item]));
          });
          ret = arr.join(' || ');
        }
        else {
          ret = 'false';
        }
        break;
      default:
        ret = [name, this.transformComparisonComparator(comp),
            this.transformComparisonValue(comp)].join(' ');

    }
    return '(' + ret + ')';
  };

  this.transformComparisonFieldName = function (comp) {
    // Use bracket-notation, in case field-name has special chars
    // or is a reserved word
    var name = 'data[\'' + comp.field + '\']';
    if (comp.opts.nocase) {
      name += '.toLowerCase()';
    }
    return name;
  };

  this.transformComparisonComparator = function (comp) {
    var comparator = comp.jsComparatorString;
    return comparator;
  };

  this.transformComparisonValue = function (comp) {
    return _transformForDataType.apply(this, [comp.datatype, comp.value,
        comp.opts.nocase]);
  };

})());

module.exports = mr;

},{"../../datatypes":8,"../../query/comparison":14,"../../query/operation":15,"./base_transformer":4,"utilities":25}],6:[function(require,module,exports){
var association
  , model = require('../index')
  , utils = require('utilities');

association = new (function () {

  this.getThroughAssnKey = function (assn, assnType, modelType, opts) {
    var through = assn.through
      , assns
      , reg = model.descriptionRegistry
      , keyAssn
      , keyName
      , side = opts.side;

    if (side == 'other') {
      if (!assn.inverse) {
        // Look through other associations, find the inverse, and cache
        // for later lookup
        for (var p in reg) {
          assns = reg[p].associations[assnType];
          for (var q in assns) {
            if (q != assn.name && assns[q].through == through) {
              assn.inverse = assns[q];
            }
          }
        }
      }
      if (!assn.inverse) {
        throw new Error('No inverse found for this through-association.');
      }
      keyAssn = assn.inverse;
    }
    else {
      keyAssn = assn;
    }

    if (keyAssn.name != keyAssn.model) {
      keyName = keyAssn.name + keyAssn.model;
    }
    else {
      keyName = keyAssn.name;
    }
    keyName = utils.string.decapitalize(keyName + 'Id');

    return keyName;
  };

  this._getAssociation = function () {
    var args = Array.prototype.slice.call(arguments)
      , assnName = args.shift()
      , assnType = args.shift()
      , callback = args.pop()
      , query
      , throughQuery
      , opts
      , otherKeyName
      , selfKeyName
      , keyName
      , queryName
      , reg = model.descriptionRegistry
      , assn = reg[this.type].associations[assnType]
      , modelName
      , through
      , throughModelName
      , throughAssn;

    // Bail out if the association doesn't exist
    if (!assn) {
      throw new Error('Model ' + this.type + ' does not have ' + assnType +
          ' association.');
    }

    modelName = assn[assnName].model;
    through = assn[assnName].through;

    // Normalize inflection
    modelName = utils.inflection.singularize(modelName);
    assnName = utils.inflection.singularize(assnName);

    // Has query object
    if (assnType == 'hasMany') {
      if (through) {
        query = {};
        throughQuery = args.shift() || {};
      }
      else {
        query = args.shift() || {};
      }
    }
    // No query object, create one
    else {
      query = {};
    }
    // Lastly grab opts if any
    opts = args.shift() || {};

    // I belong to the other model; look for the item
    // whose id matches my foreign key for that model
    if (assnType == 'belongsTo') {
      otherKeyName = modelName;
      if (modelName != assnName) {
        otherKeyName = assnName + otherKeyName;
      }
      otherKeyName = utils.string.decapitalize(otherKeyName + 'Id');
      query.id = this[otherKeyName];
    }
    // The other model belongs to me; look for any
    // items whose foreign keys match my id
    // (hasOne is just a special case of hasMany)
    else {
      if (through) {
        selfKeyName = association.getThroughAssnKey(assn[assnName], assnType,
            this.type, {side: 'other'});
      }
      else {
        selfKeyName = this.type;
        if (modelName != assnName) {
          selfKeyName = assnName + selfKeyName;
        }
        selfKeyName = utils.string.decapitalize(selfKeyName + 'Id');
      }

      query[selfKeyName] = this.id;
    }

    queryName = assnType == 'hasMany' ? 'all' : 'first';

    // -----------
    // FIXME: This is pretty terrible -- should really do these
    // async queries in some sort of composable Promisey API
    // TODO: Optimize SQL adapters by using eager-fetch w. join
    // -----------
    // Through's -- get the join-model instances, and re-fetch
    // actual assns
    if (through) {
      through = utils.string.getInflection(through, 'constructor', 'singular');
      model[through][queryName](query, opts, function (err, data) {
        var query = throughQuery
          , idColName
          , idParam;

        if (err) {
          return callback(err, null);
        }

        idColName = association.getThroughAssnKey(assn[assnName], assnType,
            modelName, {side: 'this'});

        if (assnType == 'hasMany') {
          idParam = [];
          data.forEach(function (item) {
            idParam.push(item[idColName]);
          });
        }
        else {
          idParam = item[idColName];
        }
        // No join-instances, no associated items
        if (!idParam.length) {
          callback(null, []);
        }
        else {
          query.id = idParam;
          model[modelName][queryName](query, opts, callback);
        }
      });
    }
    // Normal assns, just do the damn query
    else {
      model[modelName][queryName](query, opts, callback);
    }
  };

  this._createAssociation = function () {
    var args = Array.prototype.slice.call(arguments)
      , assnName = args.shift()
      , assnType = args.shift()
      , data = args.shift()
      , otherKeyName
      , selfKeyName
      , reg = model.descriptionRegistry
      , assn = reg[this.type].associations[assnType]
      , modelName
      , through
      , throughModelName
      , throughAssn
      , joinInstance
      , unsaved
      , params;

    // Bail out if the association doesn't exist
    if (!assn) {
      throw new Error('Model ' + this.type + ' does not have ' + assnType +
          ' association.');
    }

    modelName = assn[assnName].model
    through = assn[assnName].through;

    // Normalize inflection
    modelName = utils.inflection.singularize(modelName);
    assnName = utils.inflection.singularize(assnName);

    otherKeyName = modelName;
    selfKeyName = this.type;

    // belongsTo
    if (assnType == 'belongsTo') {
      if (!(data._saved && data.id)) {
        throw new Error('Item cannot have a belongTo association ' +
            'if the item it belongs to is not yet saved.');
      }
      // Prefix named assns
      if (modelName != assnName) {
        otherKeyName = assnName + otherKeyName;
      }
      otherKeyName = utils.string.decapitalize(otherKeyName + 'Id');

      this[otherKeyName] = data.id;
      unsaved = data._unsavedAssociations || [];
      unsaved.push({operation: 'save', item: this});
      data._unsavedAssociations = unsaved;
    }
    // hasOne, hasMany (through)
    else {
      if (!(this._saved && this.id)) {
        throw new Error('Item cannot have a hasOne/hasMany association ' +
            'if it is not yet saved.');
      }

      // ---------------
      // FIXME: This chained saving happens automagically, so
      // validation errors in the instances just throw, with
      // no visible .errors property
      // ---------------
      // Through assn
      if (through) {
        // Prefix named assns
        if (modelName != assnName) {
          otherKeyName = assnName + otherKeyName;
        }
        otherKeyName = association.getThroughAssnKey(assn[assnName], assnType,
            this.type, {side: 'this'});
        selfKeyName = association.getThroughAssnKey(assn[assnName], assnType,
            this.type, {side: 'other'});

        through = utils.string.getInflection(through, 'constructor', 'singular');
        // Create join-instance
        params = {};
        params[selfKeyName] = this.id;
        joinInstance = model[through].create(params);

        unsaved = this._unsavedAssociations || [];
        if (!data._saved) {
          // Mark actual assn for chained save
          unsaved.push({operation: 'save', item: data});
          // When this item gets saved, update the join-instance
          // with the correct assn foreign key
          data.on('save', function () {
            joinInstance[otherKeyName] = data.id;
          });
        }
        else {
          joinInstance[otherKeyName] = data.id;
        }
        // Mark join-instance for chained save
        unsaved.push({operation: 'save', item: joinInstance});
        this._unsavedAssociations = unsaved;
      }
      else {
        // Prefix named assns
        if (modelName != assnName) {
          selfKeyName = assnName + selfKeyName;
        }
        selfKeyName = utils.string.decapitalize(selfKeyName + 'Id');

        data[selfKeyName] = this.id;
        unsaved = this._unsavedAssociations || [];
        unsaved.push({operation: 'save', item: data});
        this._unsavedAssociations = unsaved;
      }
    }
  };

  this._removeAssociation = function () {
    var args = Array.prototype.slice.call(arguments)
      , assnName = args.shift()
      , assnType = args.shift()
      , data = args.shift()
      , otherKeyName
      , selfKeyName
      , reg = model.descriptionRegistry
      , assn = reg[this.type].associations[assnType]
      , modelName
      , through
      , throughModelName
      , throughAssn
      , removeQuery
      , unsaved
      , params;

    // Bail out if the association doesn't exist
    if (!assn) {
      throw new Error('Model ' + this.type + ' does not have ' + assnType +
          ' association.');
    }

    modelName = assn[assnName].model
    through = assn[assnName].through;

    // Normalize inflection
    modelName = utils.inflection.singularize(modelName);
    assnName = utils.inflection.singularize(assnName);

    otherKeyName = modelName;
    selfKeyName = this.type;

    // belongsTo -- remove the foreign-key value on this obj
    if (assnType == 'belongsTo') {
      if (modelName != assnName) {
        otherKeyName = assnName + otherKeyName;
      }
      otherKeyName = utils.string.decapitalize(otherKeyName + 'Id');

      this[otherKeyName] = null; // Remove value
      unsaved = data._unsavedAssociations || [];
      unsaved.push({operation: 'save', item: this});
      data._unsavedAssociations = unsaved;
    }
    // hasOne, hasMany (through) -- remove the foreign-key value
    // on the other obj, or remove the join-model instance for through-assn
    else {
      // ---------------
      // FIXME: This chained saving happens automagically, so
      // validation errors in the instances just throw, with
      // no visible .errors property
      // ---------------
      // Through assn
      if (through) {
        // Prefix named assns
        if (modelName != assnName) {
          otherKeyName = assnName + otherKeyName;
        }
        otherKeyName = association.getThroughAssnKey(assn[assnName], assnType,
            this.type, {side: 'this'});
        selfKeyName = association.getThroughAssnKey(assn[assnName], assnType,
            this.type, {side: 'other'});

        through = utils.string.getInflection(through, 'constructor', 'singular');

        // Create join-instance
        removeQuery = {};
        removeQuery[selfKeyName] = this.id;
        removeQuery[otherKeyName] = data.id;

        unsaved = this._unsavedAssociations || [];
        // Mark join-instance for removal
        unsaved.push({operation: 'remove', query: removeQuery, through: through});
        this._unsavedAssociations = unsaved;
      }
      else {
        // Prefix named assns
        if (modelName != assnName) {
          selfKeyName = assnName + selfKeyName;
        }
        selfKeyName = utils.string.decapitalize(selfKeyName + 'Id');

        data[selfKeyName] = null;
        unsaved = this._unsavedAssociations || [];
        unsaved.push({operation: 'save', item: data});
        this._unsavedAssociations = unsaved;
      }
    }
  };

  this._commitAssociationChanges = function (callback) {
    var self = this
      , assn
      , unsaved = this._unsavedAssociations || []
      , doIt = function () {
          if ((assn = unsaved.shift())) {
            if (assn.operation == 'save') {
              assn.item.save(function (err, data) {
                if (err) {
                  callback(err);
                }
                else {
                  doIt();
                }
              });
            }
            // Through-associations, removing join-model inst
            else if (assn.operation == 'remove') {
              model[assn.through].remove(assn.query, function (err, data) {
                if (err) {
                  callback(err);
                }
                else {
                  doIt();
                }
              });
            }
            else {
              callback(new Error('Association items can only be saved or removed.'));
            }
          }
          else {
            callback();
          }
        };

    doIt();
  };

})();

module.exports = association;

},{"../index":11,"utilities":25}],7:[function(require,module,exports){

var config = {
  useTimestamps: true
, useUTC: true
, forceCamel: true
, autoIncrementId: false
, defaultAdapter: null
};

module.exports = config;

},{}],8:[function(require,module,exports){
/*
 * Geddy JavaScript Web development framework
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/

var model = require('./index')
  , utils = require('utilities')
  , i18n = utils.i18n
  , datatypes
  , _isArray
  , _serialize
  , _quoteize
  , _escape;

_isArray = function (obj) {
  // Defer to native if possible
  if (typeof Array.isArray == 'function') {
    return Array.isArray(obj);
  }
  return obj &&
    typeof obj === 'object' &&
    typeof obj.length === 'number' &&
    typeof obj.splice === 'function' &&
    !(obj.propertyIsEnumerable('length'));
};

_serialize = function (input, options) {
  var val = String(input)
    , opts = options || {};
  if (opts.escape) {
    val = _escape(val, opts.escape);
  }
  if (opts.useQuotes) {
    val = _quoteize(val);
  }
  if (opts.lowercase) {
    val = val.toLowerCase();
  }
  return val;
};

_quoteize = function (val) {
  return ["'", "'"].join(val);
}

_escape = function (s, type) {
  var ret;
  switch (type) {
    // Scrub input for basic SQL injection protection
    case 'sql':
      ret = s.replace(/'/g, "''");
      break;
    // Backslash-esc single quotes for use in M/R JS sourcecode str
    case 'js':
      ret = s.replace(/'/g, "\\'");
      break;
    default:
      throw new Error(type + ' is not a valid type of escaping.');
  }
  return ret;
};

/*
 * Datatype verification -- may modify the value by casting
 */
datatypes = {

  'string': {
    validate: function (name, val, locale) {
      return {
        err: null
      , val: String(val)
      };
    }
  , serialize: function (input, options) {
      return _serialize(input, options);
    }
  }

, 'text': {
    validate: function (name, val, locale) {
      return {
        err: null
      , val: String(val)
      };
    }
  , serialize: function (input, options) {
      return _serialize(input, options);
    }
  }

, 'number': {
    validate: function (name, val, locale) {
      if (isNaN(val)) {
        return {
          err: i18n.getText('model.validatesNumber', {name: name}, locale)
        , val: null
        };
      }
      return {
        err: null
      , val: Number(val)
      };
    }
  , serialize: function (input, options) {
      var opts = options || {};
      return _serialize(input, {
        escape: opts.escape
      });
    }
  }

, 'int': {
    validate: function (name, val, locale) {
      // Allow decimal values like 10.0 and 3.0
      if (Math.round(val) != val) {
        return {
          err: i18n.getText('model.validatesInteger', {name: name}, locale)
        , val: null
        };
      }
      return {
        err: null
      , val: parseInt(val, 10)
      };
    }
  , serialize: function (input, options) {
      var opts = options || {};
      return _serialize(input, {
        escape: opts.escape
      });
    }
  }

, 'boolean': {
    validate: function (name, val, locale) {
      var validated;
      switch (typeof val) {
        case 'string':
          switch (val) {
            case 'true':
            case 't':
            case 'yes':
            case '1':
              validated = true;
              break;
            case 'false':
            case 'f':
            case 'no':
            case '0':
              validated = false;
              break;
          }
          break;
        case 'number':
          if (val == 1) {
            validated = true;
          }
          else if (val == 0) {
            validated = false;
          }
          break;
        case 'boolean':
          validated = val;
          break;
        default:
          // Nothing
      }

      if (typeof validated != 'boolean') {
        return {
          err: i18n.getText('model.validatesBoolean', {name: name}, locale)
        , val: null
        };
      }
      return {
        err: null
        , val: validated
      };
    }
  , serialize: function (input, options) {
      var opts = options || {};
      return _serialize(input, {
        escape: opts.escape
      });
    }
  }

, 'object': {
    validate: function (name, val, locale) {
      // Allow saving of arrays as the datatype array only saves arrays
      // of numbers or strings correctly, but not arrays of objects
      // We're just not bothing with a separate Array datatype anymore

      // maybe a JSON string?
      if (typeof val === 'string') {
        try {
          var obj = JSON.parse(val);
          return {
            err: null,
            val: obj
          }
        }
        catch(err) {
          return {
            err: i18n.getText('model.validatesObject', {name: name}, locale),
            val: null
          }
        }
      }
      else if (typeof val != 'object') {
        return {
          err: i18n.getText('model.validatesObject', {name: name}, locale)
        , val: null
        };
      }
      return {
        err: null
      , val: val
      };
    }
  , serialize: function (input, options) {
      var val
        , opts = options || {};

      // Arrays will be converted to JSON
      if (_isArray(input)) {
          val = JSON.stringify(input);
      }
      // Otherwise just try to serialize via toString
      else if (typeof input.toString == 'function') {
        val = input.toString();
        // If this happens the object had no usefull toString()
        // method and we should make JSON out of it
        if (val == "[object Object]") {
          val = JSON.stringify(input);
        }
      }
      else {
        val = JSON.stringify(input);
      }
      // FIXME: Does escaping a JSONized object make sense?
      return _serialize(val, opts);
    }
  }

, 'date': {
    validate: function (name, val, locale) {
      var dt = utils.date.parse(val);
      if (dt) {
        return {
          err: null
        , val: dt
        };
      }
      else {
        return {
          err: i18n.getText('model.validatesDate', {name: name}, locale)
        , val: null
        };
      }
    }
  , serialize: function (input, options) {
      var val
        , opts = options || {};
      if (model.config.useUTC) {
        val = utils.date.toUTC(input);
      }
      else {
        val = input;
      }
      val = utils.date.strftime(val, '%F');
      return _serialize(val, opts);
    }
  }

, 'datetime': {
    validate: function (name, val, locale) {
      var dt = utils.date.parse(val);
      if (dt) {
        return {
          err: null
        , val: dt
        };
      }
      else {
        return {
          err: i18n.getText('model.validatesDatetime', {name: name}, locale)
        , val: null
        };
      }
    }
  , serialize: function (input, options) {
      var val
        , opts = options || {};
      if (model.config.useUTC) {
        val = utils.date.toUTC(input);
      }
      else {
        val = input;
      }
      val = utils.date.toISO8601(val, {utc: true});
      return _serialize(val, options);
    }
  }

  // This is a hack -- we're saving times as Dates of 12/31/1969, and the
  // desired time
, 'time': {
    validate: function (name, val, locale) {
      var dt = utils.date.parse(val);
      if (dt) {
        return {
          err: null
        , val: dt
        };
      }
      else {
        return {
          err: i18n.getText('model.validatesTime', {name: name}, locale)
        , val: null
        };
      }
    }
  , serialize: function (input, options) {
      var val
        , opts = options || {};
      val = utils.date.strftime(val, '%T');
      return _serialize(val, opts);
    }
  }

};

module.exports = datatypes;

// Lazy-load; model loads this file first
model = require('./index');

},{"./index":11,"utilities":25}],9:[function(require,module,exports){

var formatters = new function () {
  this.date = function (val) {
    return geddy.date.strftime(val, geddy.config.dateFormat);
  };

  this.time = function (val) {
    return geddy.date.strftime(val, geddy.config.timeFormat);
  };

}();

module.exports = formatters;

},{}],10:[function(require,module,exports){
var utils = require('utilities')
  , StandardGenerator
  , MySQLGenerator
  , PostgresGenerator
  , SQLiteGenerator
  , datatypeMap
  , generatorMap;

// TODO Better map, SQL-implementation specific
datatypeMap = {
  'string': 'VARCHAR(255)'
, 'text': 'TEXT'
, 'number': 'REAL'
, 'int': 'INTEGER'
, 'boolean': 'BOOLEAN'
, 'date': 'DATE'
, 'datetime': 'TIMESTAMP'
, 'time': 'TIME'
, 'object': 'TEXT'
};

StandardGenerator = function () {
  this._datatypes = utils.mixin({}, datatypeMap);
  this.COLUMN_NAME_DELIMITER = '"';
};

StandardGenerator.prototype = new (function () {

  this.getDatatype = function (jsType) {
    return this._datatypes[jsType];
  };

  this.addColumnStatement = function (prop, options) {
    var sql = 'ADD COLUMN '
      , opts = options || {}
      , delimiter = this.COLUMN_NAME_DELIMITER;
      sql += delimiter + utils.string.snakeize(prop.name) + delimiter;
      if (prop.datatype) {
        sql += ' ' + this.getDatatype(prop.datatype);
      }
      if (opts.append) {
        sql += ' ' + opts.append;
      }
      return sql;
  };

  this.dropColumnStatement = function (prop) {
    var sql = 'DROP COLUMN '
      , delimiter = this.COLUMN_NAME_DELIMITER;
    sql += delimiter + utils.string.snakeize(prop.name) + delimiter;
    return sql;
  };

  this.alterColumnStatement = function (prop) {
    var sql = 'ALTER COLUMN '
      , delimiter = this.COLUMN_NAME_DELIMITER;
    sql += delimiter + utils.string.snakeize(prop.name) + delimiter + ' ';
    sql += 'TYPE ' + this.getDatatype(prop.datatype);
    return sql;
  };

  this.renameColumnStatement = function (prop) {
    var sql = 'RENAME COLUMN '
      , delimiter = this.COLUMN_NAME_DELIMITER;
    sql += delimiter + utils.string.snakeize(prop.name) + delimiter + ' ';
    sql += 'TO ' + delimiter + utils.string.snakeize(prop.newName) + delimiter;
    return sql;
  };

  // CREATE TABLE distributors (did integer, name varchar(40));
  this.createTableStatement = function (name, props, options) {
    var model = require('../index')
      , sql = ''
      , opts = options || {}
      , tableName
      , idCol
      , propArr = [];

    tableName = utils.string.getInflection(name, 'filename', 'plural');

    sql += 'CREATE TABLE ' + tableName + ' (';

    // Use DB auto-increment
    // FIXME: Is this syntax Postgres-specific?
    if (model.config.autoIncrementId) {
      idCol = this.addColumnStatement({
        name: 'id'
      }, {append: 'BIGSERIAL PRIMARY KEY'});
    }
    // Use string UUIDs
    else {
      idCol = this.addColumnStatement({
        name: 'id'
      , datatype: 'string'
      }, {append: 'PRIMARY KEY'});
    }
    propArr.push(idCol);

    for (var p in props) {
      propArr.push(this.addColumnStatement(props[p]));
    }
    sql += propArr.join(', ');
    sql += ');';
    // Strip out the ADD COLUMN commands, which are implicit
    // in a CREATE TABLE
    sql = sql.replace(/ADD COLUMN /g, '');
    return sql;
  };

  this.alterTableStatement = function (name, alterations, options) {
    var self = this
      , sql = ''
      , opts = options || {}
      , alter = Array.isArray(alterations) ? alterations : [alterations]
      , alterArr = []
      , tableName;

    tableName = utils.string.getInflection(name, 'filename', 'plural');
    sql += 'ALTER TABLE ' + tableName + ' ';

    // {operation: 'add', property: {name: 'foo', datatype: 'string'}}
    alter.forEach(function (item) {
      alterArr.push(self[item.operation + 'ColumnStatement'](item.property));
    });
    sql += alterArr.join(', ');
    sql += ';';
    return sql;
  };

  this.dropTableStatement = function (name) {
    var sql = ''
      , tableName = utils.string.getInflection(name, 'filename', 'plural');
    sql += 'DROP TABLE IF EXISTS ' + tableName + '; ';
    return sql;
  };

  this.createTable = function (modelNames) {
    var model = require('../index')
      , self = this
      , sql = ''
      , reg = model.descriptionRegistry
      , props
      , names = Array.isArray(modelNames) ?
            modelNames : [modelNames];
    names.forEach(function (name) {
      props = reg[name].properties;
      sql += self.createTableStatement(name, props);
    });
    return sql;
  };

  this.dropTable = function (modelNames) {
    var self = this
      , sql = ''
      , names = Array.isArray(modelNames) ?
            modelNames : [modelNames];
    names.forEach(function (name) {
      sql += self.dropTableStatement(name);
    });
    return sql;
  };

})();

PostgresGenerator = function () {
  StandardGenerator.call(this);
  this._datatypes = utils.mixin({}, datatypeMap);
  utils.mixin(this._datatypes, {
    'int': 'BIGINT'
  , 'object': 'JSON'
  });
};
PostgresGenerator.prototype = Object.create(StandardGenerator.prototype);

MySQLGenerator = function () {
  StandardGenerator.call(this);
  this._datatypes = utils.mixin({}, datatypeMap);
  utils.mixin(this._datatypes, {
    'int': 'BIGINT'
  , 'datetime': 'TIMESTAMP NULL'
  });
  this.COLUMN_NAME_DELIMITER = '`';
};
MySQLGenerator.prototype = Object.create(StandardGenerator.prototype);
MySQLGenerator.prototype.alterColumnStatement = function (prop) {
  var sql = 'MODIFY COLUMN '
    , delimiter = this.COLUMN_NAME_DELIMITER;
  sql += delimiter + utils.string.snakeize(prop.name) + delimiter + ' ';
  sql += this.getDatatype(prop.datatype);
  return sql;
};

SQLiteGenerator = function () {
  StandardGenerator.call(this);
};
SQLiteGenerator.prototype = Object.create(StandardGenerator.prototype);
SQLiteGenerator.prototype.alterColumnStatement = function (prop) {
  var msg = 'Sorry, SQLite does not support ALTER COLUMN: ' +
      'http://www.sqlite.org/lang_altertable.html\n' +
      'Please use PostgreSQL or MySQL, ' +
      'or work around using ADD/REMOVE and a temp column: ' +
      'http://stackoverflow.com/questions/805363/how-do-i-rename-a-column-in-a-sqlite-database-table';
  throw new Error(msg);
};

generatorMap = {
  postgres: PostgresGenerator
, mysql: MySQLGenerator
, sqlite: SQLiteGenerator
};

module.exports = {
  StandardGenerator: StandardGenerator
, getGeneratorForAdapter: function (adapter) {
    var ctor = generatorMap[adapter.name];
    return new ctor();
  }
};


},{"../index":11,"utilities":25}],11:[function(require,module,exports){
/*
 * Geddy JavaScript Web development framework
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/

/*
Example model file, would be app/models/user.js:

var User = function () {
  this.property('login', 'string', {required: true});
  this.property('password', 'string', {required: true});
  this.property('lastName', 'string');
  this.property('firstName', 'string');

  this.validatesPresent('login');
  this.validatesFormat('login', /[a-z]+/, {message: 'Subdivisions!'});
  this.validatesLength('login', {min: 3});
  this.validatesConfirmed('password', 'confirmPassword');
  this.validatesWithFunction('password',
      function (s) { return s.length > 0; // Could be anything
  });
};

User.prototype.someMethod = function () {
  // Do some stuff on a User instance
};

User = model.register('User', User);
*/

var util = require('util') // Native Node util module
  , model = {}
  , EventEmitter = require('events').EventEmitter
  , utils = require('utilities')
  , config = require('./base_config')
  , adapters = require('./adapters')
  , Query
  , query // Lazy-load query; it depends on model/index
  , association; // Lazy-load query; it depends on model/index

var _foreignKeyCreators = []
  , _systemProperties = {
      id: true
    , type: true
    , createdAt: true
    , updatedAt: true
    };

utils.mixin(model, new (function () {

  this.config = config;
  this.ModelBase = function () {};
  this.adapters = {};
  this.descriptionRegistry = {};
  this.defaultAdapter = null;

  this.datatypes = null // Lazy-load query; it depends on model/index
  this.validators = require('./validators');
  this.formatters = require('./formatters');
  this.Migration = require('./migration').Migration;
  this.log = function () {};

  util.inherits(this.ModelBase, EventEmitter);

  var _createModelItemConstructor = function (def) {
    // Base constructor function for all model items
    var ModelItemConstructor = function (params) {
      var self = this
        , associations = model.descriptionRegistry[def.name].associations;

      this.type = def.name;
      // Items fetched from an API should have this flag set to true
      this._saved = params._saved || false;

      // If fetched and instantiated from an API-call, give the
      // instance the appropriate ID -- newly created objects won't
      // have one until saved
      if (params.id) {
        this.id = params.id;
      }

      this.isValid = function () {
        return !this.errors;
      };

      /**
        @name ModelBase#save
        @public
        @function
        @description Saves an instance of a Geddy ModelBase
        @param {Object} [opts]
          @param {String} [opts.locale=null] Optional locale for
          localizing error messages from validations
        @param {Function} [callback] Callback function that receives
        the result of the save action -- should be in the format of
        function (err, result) {}
       */
      this.save = function () {
        var args = Array.prototype.slice.call(arguments)
          , m = model[this.type];
        args.unshift(this);
        this._commitAssociationChanges(function (err, data) {
          var cb;
          if (err) {
            cb = args.pop();
            return cb(err);
          }
          m.save.apply(m, args);
        });
      };

      /**
        @name ModelBase#updateProperties
        @public
        @function
        @description Updates the attributes an instance of a Geddy
        ModelBase, and validate the changes
        @param {Object} params Object-literal with updated values for
        the instance
        the result of the save action -- should be in the format of
        function (err, result) {}
        @param {Object} [opts]
          @param {String} [opts.locale=null] Optional locale for
          localizing error messages from validations
       */
      this.updateProperties = function (params, opts) {
        model.updateItem(this, params, opts || {});
      };
      // TODO: Deprecate?
      this.updateAttributes = this.updateProperties;
      /**
        @name ModelBase#toJSON
        @public
        @function
        @description Returns an object with just the data properties
        defined by its model
       */
      this.toJSON = function (options) {
        var self = this
          , opts = options || {}
          , whitelist = Object.keys(_systemProperties)
          , obj = {}
          , reg = model.descriptionRegistry[this.type]
          , properties = reg.properties
          , associations = reg.associations || {}
          , assns = {
              hasMany: 'plural'
            , hasOne: 'singular'
            , belongsTo: 'singular'
            }
          , assnList
          , assnName;

        whitelist = whitelist.concat(opts.whitelist || [])

        // First, simple defined properties
        for (var p in properties) {
          obj[p] = this[p];
        }

        // Assocations
        for (var k in assns) {
          assnList = associations[k];
          for (var p in assnList) {
            assnName = utils.string.getInflection(p, 'property', assns[k]);
            if (this[assnName]) {
              obj[assnName] = this[assnName];
            }
          }
        }

        // Any non-defined, but whitelisted properties
        whitelist.forEach(function (p) {
          if (self[p]) {
            obj[p] = self[p];
          }
        });

        return obj;
      };

      this.toData = this.toJSON;
      this.toObj = this.toJSON;

      this.toString = function () {
        var obj = {}
          , reg = model.descriptionRegistry[this.type]
          , properties = reg.properties
          , formatter;

        obj.id = this.id;
        obj.type = this.type;

        for (var p in properties) {
          formatter = model.formatters[properties[p].datatype];
          obj[p] = typeof formatter == 'function' ?
              formatter(this[p]) : this[p];
        }

        return JSON.stringify(obj);
      };


      this._getAssociation = association._getAssociation;
      this._createAssociation = association._createAssociation;
      this._removeAssociation = association._removeAssociation;
      this._commitAssociationChanges = association._commitAssociationChanges;

      /**
        @name ModelBase#clone
        @private
        @function
        @description Creates a 'deep copy' of the model object
      */
      this.clone = function () {
        var itemClone;

        // clone the item
        itemClone = model[this.type].create(utils.enhance({}, this.toJSON(), {id:this.id}));
        itemClone.associations = utils.enhance({}, this.associations);
        itemClone._saved = this._saved;

        return itemClone;
      };

      // Intstance-methods for associations
      // get..., set.../add..., remove...
      ['hasMany', 'hasOne', 'belongsTo'].forEach(function (k) {
        var assns
          , createMethod = function (type, keyName, assnType) {
              return function () {
                var args = Array.prototype.slice.call(arguments);
                args.unshift(assnType);
                args.unshift(keyName);
                self[type + 'Association'].apply(self, args);
              };
            };
        if ((assns = associations[k])) {
          for (var assnName in assns) {
            (function (assnName) {
              var methodName = k == 'hasMany' ?
                      utils.inflection.pluralize(assnName) : assnName
                , keyForCreate = k == 'hasMany' ? 'add' : 'set';

              // get can be singular or plural, depending on hasMany/hasOne
              // this.getBooks({}, {}, function () {}); =>
              // this._getAssociation('Book', 'hasMany', {}, {}, function () {});
              self['get' + methodName] = createMethod('_get', assnName, k);

              // add/set is always singular, just use assnName for method
              // this.addBook(book); =>
              // this._createAssociation('Book', 'hasMany', book);
              self[keyForCreate + assnName] = createMethod('_create', assnName, k);

              // this.removeBook(book); =>
              // this._removeAssociation('Book', 'hasMany', book);
              self['remove' + assnName] = createMethod('_remove', assnName, k);
            })(assnName);
          }
        }
      });

    };

    return ModelItemConstructor;
  };

  var _createStaticMethodsMixin = function (name) {
    var obj = {};

    /**
      @name ModelBase.create
      @public
      @static
      @function
      @description Creates an instance of a Geddy ModelBase, validating
      the input parameters
      @param {Object} params Object-literal with updated values for
      the instance
      the result of the save action -- should be in the format of
      function (err, result) {}
      @param {Object} [opts]
        @param {String} [opts.locale=null] Optional locale for
        localizing error messages from validations
     */
    obj.create = function () {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(name);
      return model.createItem.apply(model, args);
    };

    obj.getAdapter = function() {
      return model.getAdapterForModel(name);
    };

    // Returns the first item found
    obj.first = function () {
      var args = Array.prototype.slice.call(arguments)
        , callback = args.pop()
        , query = args.shift() || {}
        , opts = args.shift() || {}
        , includeOpts;

      if (typeof query == 'string' || typeof query == 'number') {
        query = {id: query};
      }

      if (!opts.id) {
        opts.limit = 1;
        // Can't use simple LIMIT with eager-fetch of associations
        // Do an additional query with LIMIT to fetch the first object,
        // then the normal query by ID with associations
        if (opts.includes) {
          includeOpts = utils.mixin({}, opts);
          delete includeOpts.includes;
          return obj.all(query, includeOpts, function (err, data) {
            if (err) {
              return callback(err, null);
            }
            if (data && data.id) {
              delete opts.limit;
              // TODO: If queries eventually return EventEmitters,
              // need to proxy the events upward to the wrapping query
              obj.all({id: data.id}, opts, function (err, data) {
                if (err) {
                  return callback(err, null);
                }
                if (data && data.length) {
                  callback(null, data[0]);
                }
                else {
                  callback(null, null);
                }
              });
            }
            else {
              callback(null, null);
            }
          });
        }
      }

      return obj.all(query, opts, callback);
    };

    obj.count = function() {
      var args = Array.prototype.slice.call(arguments)
        , callback = args.pop() || function () {}
        , query = args.shift() || {}
        , opts = args.shift() || {};
      opts.count = true;
      if (opts.includes) {
        throw new Error('`count` cannot be used with eager fetch of associations.');
      }
      return obj.all.apply(obj, [query, opts, callback]);
    };

    // TODO: Deprecate
    obj.load = obj.first;

    obj.all = function () {
      var args = Array.prototype.slice.call(arguments)
      // Important: do not stub out a callback -- if a callback is
      // defined, all results of the query will be buffered
        , callback = typeof args[args.length - 1] == 'function' ?
              args.pop() : null
        , query = args.shift() || {}
        , opts = args.shift() || {}
        , adapt;

      opts.scenario = opts.scenario || 'reify';

      query = new Query(model[name], query, opts);

      adapt = model.getAdapterForModel(name);
      if (opts.includes && adapt.type != 'sql') {
        throw new Error('Only SQL adapters support ' +
            'the "includes" option for queries.');
      }

      return adapt.load.apply(adapt, [query, callback]);
    };

    obj.save = function () {
      var args = Array.prototype.slice.call(arguments)
        , beforeSaveArgs = args.slice()
        , emitFunc = function () {
            model[name].emit.apply(model[name], beforeSaveArgs);
          }
        , data = args.shift()
        , callback = args.pop() || function () {}
        , opts = args.shift() || {}
        , adapt
        , saved
        , item
        , isCollection;

      beforeSaveArgs.unshift('beforeSave');

      adapt = model.getAdapterForModel(name);

      isCollection = Array.isArray(data);
      // Collection
      // Bulk save only works on new items -- existing item should only
      // be when doing instance.save because update takes only one set
      // of edited props to be applied to all items
      if (isCollection) {

        emitFunc();

        saved = false;
        for (var i = 0, ii = data.length; i < ii; i++) {
          item = data[i];
          if (item._saved) {
            return callback(new Error('A bulk-save can only have new ' +
                'items in it.'), null);
          }
          // Bail out if any instance isn't valid and no force flag
          if (!(item.isValid() || opts.force)) {
            return callback(item.errors, null);
          }
        }
      }
      // Single item
      else {

        saved = data._saved;
        // Bail out if instance isn't valid
        if (!(data.isValid() || opts.force)) {
          return callback(data.errors, null);
        }
        // Already existing instance, use update
        if (saved) {
          if (model.config.useTimestamps) {
            data.updatedAt = new Date();
          }
          // Re-route to update
          return obj.update.apply(obj, [data, {id: data.id},
              opts, callback]);
        }

        if (typeof data.beforeSave === 'function') {
          data.beforeSave();
        }
        data.emit('beforeSave');
        emitFunc();
      }

      return adapt.insert.apply(adapt, [data, opts, function (err, res) {
        if (!err) {
          model[name].emit('save', res);
          if (!isCollection) {
            if (typeof data.afterSave === 'function') {
              data.afterSave();
            }

            data.emit('save');
          }
        }
        callback(err, res);
      }]);
    };

    obj.update = function () {
      var args = Array.prototype.slice.call(arguments)
        , data
        , callback
        , query
        , opts
        , adapt;

      args.unshift('beforeUpdate');
      model[name].emit.apply(model[name], args);
      args.shift();

      data = args.shift();
      callback = args.pop() || function () {};
      query = args.shift() || {};
      opts = args.shift() || {};

      if (typeof query == 'string' || typeof query == 'number') {
        query = {id: query};
      }

      // Data may by just a bag or params, or an actual instance
      if (data instanceof model.ModelBase) {
        // Bail out if instance isn't valid
        if (!(data.isValid() || opts.force)) {
          return callback(data.errors, null);
        }
        data.emit('beforeUpdate');
      }

      query = new Query(model[name], query, opts);

      adapt = model.getAdapterForModel(name);

      return adapt.update.apply(adapt, [data, query, function (err, res) {
        if (!err) {
          model[name].emit('update', res);
          // Data may by just a bag or params, or an actual instance
          if (typeof data.emit == 'function') {
            if (typeof data.afterUpdate === 'function') {
              data.afterUpdate();
            }
            data.emit('update');
          }
        }
        callback(err, res);
      }]);
    };

    obj.remove = function () {
      var args = Array.prototype.slice.call(arguments)
        , query
        , callback
        , opts
        , adapt;

      args.unshift('beforeRemove');
      model[name].emit.apply(model[name], args);
      args.shift();

      query = args.shift();
      callback = args.pop() || function () {};
      opts = args.shift() || {};

      if (typeof query == 'string' || typeof query == 'number') {
        query = {id: query};
        opts.limit = 1;
      }

      query = new Query(model[name], query, opts);

      adapt = model.getAdapterForModel(name);

      return adapt.remove.apply(adapt, [query, function (err, res) {
        if (!err) {
          model[name].emit('remove', res);
        }
        callback(err, res);
      }]);
    };

    obj.getPropertyNames = function () {
      var reg = model.descriptionRegistry[name]
        , properties = reg.properties;
      return Object.keys(properties);
    };

    obj.modelName = name;

    return obj;
  };

  this.clearDefinitions = function (defs) {
    var self = this;
    defs.forEach(function (m) {
      // Prefer 'name', accept older 'ctorName'
      var name = m.name || m.ctorName;
      // Registration may have happened in the model definition file
      // if using the old templates. Don't re-register
      delete self[name];
    });
  };

  this.registerDefinitions = function (defs) {
    var self = this;
    defs.forEach(function (m) {
      // Prefer 'name', accept older 'ctorName'
      var name = m.name || m.ctorName;
      // Registration may have happened in the model definition file
      // if using the old templates. Don't re-register
      if (!self[name]) {
        self.registerDefinition(name, m.ctor);
      }
    });
    this.createForeignKeys();
  };

  // Alias to single-def registration method
  this.register = function (name, ModelDefinition) {
    return this.registerDefinition(name, ModelDefinition);
  };

  this.registerDefinition = function (name, ModelDefinition) {
    var origProto = ModelDefinition.prototype
      , defined
      , ModelCtor;

    // Create the place to store the metadata about the model structure
    // to use to do validations, etc. when constructing
    model.descriptionRegistry[name] = new model.ModelDescription(name);
    // Execute all the definition methods to create that metadata
    ModelDefinition.prototype = new model.ModelDefinitionBase(name);
    defined = new ModelDefinition();

    // Create the constructor function to use when calling static
    // ModelCtor.create. Gives them the proper instanceof value,
    // and .valid, etc. instance-methods.
    ModelCtor = _createModelItemConstructor(defined);

    // Mix in the static methods like .create and .load
    utils.mixin(ModelCtor, _createStaticMethodsMixin(name));
    // Mix on the statics on the definition 'ctor' onto the
    // instantiated ModelDefinition instance
    utils.mixin(defined, ModelDefinition);
    // Mix ModelDefinition instance properties as static properties
    // for the model item 'ctor'
    utils.mixin(ModelCtor, defined);
    // Same with EventEmitter methods
    utils.enhance(ModelCtor, new EventEmitter());

    // Mix any functions defined directly in the model-item definition
    // 'constructor' into the original prototype, and set it as the prototype of the
    // actual constructor
    utils.mixin(origProto, defined);

    ModelCtor.prototype = new model.ModelBase();
    // Preserve any inherited shit from the definition proto
    utils.enhance(ModelCtor.prototype, origProto);

    model[name] = ModelCtor;

    return ModelCtor;
  };

  this.createItem = function (name, p, o) {
    var params = p || {}
      , opts = o || {}
      , item = new model[name](params);

    // Default to the 'create' scenario
    opts.scenario = opts.scenario || 'create'

    model[name].emit('beforeCreate', p, o);

    this.validateAndUpdateFromParams(item, params, opts);

    if (this.config.useTimestamps && !item.createdAt) {
      item.createdAt = new Date();
    }

    if (typeof item.afterCreate === 'function') {
      item.afterCreate();
    }
    model[name].emit('create', item);
    return item;
  };

  this.updateItem = function (item, params, opts) {
    var data = {}
      , name = item.type
      , opts = opts || {};

    // Default to the 'update' scenario
    opts.scenario = opts.scenario || 'update'

    model[name].emit('beforeUpdateProperties', item, params, opts);
    item.emit('beforeUpdateProperties');

    utils.mixin(data, item);
    utils.mixin(data, params);
    this.validateAndUpdateFromParams(item, data, opts);

    if (typeof item.afterUpdateProperties === 'function') {
      item.afterUpdateProperties();
    }

    model[name].emit('updateProperties', item);
    item.emit('updateProperties');

    return item;
  };

  this.validateAndUpdateFromParams = function (item, passedParams, opts) {
    var params
      , name = item.type
      , type = model.descriptionRegistry[name]
      , properties = type.properties
      , validated = null
      , errs = null
      , camelizedKey
      , skip = opts.skip
      , scenario = opts.scenario
      , skipKeys = {}
      , val;

    if (typeof item.beforeValidate === 'function') {
      item.beforeValidate(passedParams);
    }
    item.emit('beforeValidate')
    model[name].emit('beforeValidate', item, passedParams);

    // May be revalidating, clear errors
    delete item.errors;

    // Convert snake_case names in params to camelCase
    if (this.config.forceCamel) {
      params = {};
      for (var p in passedParams) {
        // Allow leading underscores in the keys for pseudo-privates
        camelizedKey = utils.string.camelize(p, {leadingUnderscore: true});
        params[camelizedKey] = passedParams[p];
      }
    }
    else {
      params = passedParams;
    }

    // User-input should never contain these -- but we still want
    // to validate them to make sure the format didn't get fucked up
    if (typeof item.createdAt != 'undefined') {
      params.createdAt = item.createdAt;
    }
    if (typeof item.updatedAt != 'undefined') {
      params.updatedAt = item.updatedAt;
    }

    if (skip) {
      for (var i in skip) {
        skipKeys[skip[i]] = true;
      }
    }

    for (var p in properties) {
      if (skipKeys[p]) {
        continue;
      }

      validated = this.validateProperty(properties[p], params, {scenario: scenario});
      // If there are any failed validations, the errs param
      // contains an Object literal keyed by field name, and the
      // error message for the first failed validation for that
      // property
      // Use raw, invalid value on the instance
      if (validated.err) {
        errs = errs || {};
        errs[p] = validated.err;
        item[p] = params[p];
      }
      // Otherwise add the type-coerced, valid value to the return item
      else {
        item[p] = validated.val;
      }
    }

    // Should never have been incuded in user input, so safe to
    // rm these from the params
    delete params.createdAt;
    delete params.updatedAt;

    if (errs) {
      item.errors = errs;
    }

    if (typeof item.afterValidate === 'function') {
      item.afterValidate();
    }

    item.emit('validate')
    model[name].emit('validate', item);

    return item;
  };

  this.validateProperty = function (prop, params, opts) {

    var options = opts || {}
      , name = prop.name
      , val = params[name]
      , datatypeName = prop.datatype.toLowerCase()
      , datatypeValidator = this.datatypes[datatypeName].validate
      , result
      , scenario = opts.scenario
      , locale = options.locale || utils.i18n.getDefaultLocale();

    // Validate for the base datatype only if there actually is a value --
    // e.g., undefined will fail the validation for Number, even if the
    // field is optional
    if (!utils.isEmpty(val)) {
      // 'Any' datatype
      if (prop.datatype == '*') {
        result = {
          val: val
        };
      }
      // Specific datatype -- perform validation/type-coercion
      else {
        result = datatypeValidator(name, val, locale);
        if (result.err) {
          return {
            err: result.err,
            val: null
          };
        }
      }
      // Value may have been modified in the datatype check -- e.g.,
      // 'false' changed to false, '8.0' changed to 8, '2112' changed to
      // 2112, etc.
      val = result.val;
    }

    // Now go through all the base validations for this property
    var validations = prop.validations
      , validator
      , err
      , rule;

    for (var p in validations) {
      validator = model.validators[p]
      rule = utils.mixin({}, validations[p], {scenario: opts.scenario});

      if (typeof validator != 'function') {
        throw new Error(p + ' is not a valid validator');
      }

      err = validator(name, val, params, rule, locale);
      // If there's an error for a validation, don't bother
      // trying to continue with more validations -- just return
      // this first error message
      if (err) {
        return {
          err: err,
          val: null
        };
      }
    }

    // If there weren't any errors, return the value for this property
    // and no error
    return {
      err: null,
      val: val
    };
  };

  this.createAdapter = function (name, config) {
    return adapters.create(name, config);
  };

  this.getAdapterInfo = function (name) {
    return adapters.getAdapterInfo(name);
  };

  this.getAdapterForModel = function (modelName) {
    var ctor = this[modelName]
      , adapter = (ctor && ctor.adapter) || this.defaultAdapter;
    if (!adapter) {
      throw new Error('No adapter found for ' + modelName +
          '. Please define one with `setAdapter`, or define a default' +
          ' adapter with `model.setDefaultAdapter`.');
    }
    return adapter;
  };

  this.setDefaultAdapter = function (name, config) {
    var adapter = adapters.create(name, config);
    this.defaultAdapter = adapter;
  };

  // FIXME: Move this into an associations lib
  this.getAssociation = function (main, assn) {
    var mainName = utils.string.getInflection(main, 'constructor', 'singular')
      , assnName = utils.string.getInflection(assn, 'constructor', 'singular')
      , assn
      , assnItem;
    assn = this.descriptionRegistry[mainName].associations;
    for (var p in assn) {
      assnItem = assn[p][assnName];
      if (assnItem) {
        return assnItem;
      }
    }
  };

  this.getAssociationType = function (main, assn) {
    var mainName = utils.string.getInflection(main, 'constructor', 'singular')
      , assnName = utils.string.getInflection(assn, 'constructor', 'singular')
      , assn
      , assnItem;
    assn = this.descriptionRegistry[mainName].associations;
    for (var p in assn) {
      assnItem = assn[p][assnName];
      if (assnItem) {
        return p;
      }
    }
  };

  this.getModelByName = function (name) {
    return this[name];
  };

  this.createForeignKeys = function () {
    var creator;
    while((creator = _foreignKeyCreators.pop())) {
      creator();
    }
  };

  this.setLocalRequireError = function (msg) {
    this.localRequireError = msg;
  };

})());

model.ModelDefinitionBase = function (name) {
  var self = this
    , reg = model.descriptionRegistry
    , _createValidator = function (p) {
        return function () {
          var args = Array.prototype.slice.call(arguments);
          args.unshift(p);
          return self.validates.apply(self, args);
        };
      };

  this.name = name;

  this.setAdapter = function (name, config) {
    var adapter = adapters.create(name, config);
    this.adapter = adapter;
  };

  this.property = function (name, datatype, options) {
    var opts = options || {};

    // Don't allow users to define properties with the same
    // name as magical system properties
    if (!opts.isSystem && _systemProperties[name]) {
      throw new Error('You cannot define the property "' + name +
          '" on a model, as it\'s a reserved system-property name.');
    }

    reg[this.name].properties[name] =
      new model.PropertyDescription(name, datatype, opts);
  };

  this.defineProperties = function (obj) {
    var type
      , options
      , property;

    for (var name in obj) {
      property = obj[name];

      if (typeof property === 'string') {
        type = property;
        options = {};
      }
      else {
        type = property.type;
        options = property;
      }

      this.property(name, type, options);
    }
  }

  // (condition, name, [reference], [opts])
  this.validates = function () {
    var args = Array.prototype.slice.call(arguments)
      , arg
      , condition = args.shift()
      , name = args.shift()
      , reference
      , opts = {};
    while ((arg = args.pop())) {
      // Regex for validatesFormat or function for validatesWithFunction
      // or string param name for validatesConfirmed
      if (arg instanceof RegExp || typeof arg == 'function' ||
          typeof arg == 'string') {
        reference = arg;
      }
      else {
        opts = utils.mixin(opts, arg);
      }
    }

    // Old API allows passing simple number to validatesLength
    if (!isNaN(opts)) {
      opts = {is: opts};
    }

    // Default to 'create' and 'update' only for scenarios
    opts.on = opts.on || ['create', 'update'];

    if (typeof reg[this.name].properties[name] === 'undefined') {
      throw new Error('Validation cannot be added for "' + name +
                      '": property does not exist on the ' + this.name +
                      ' model.');
    }

    reg[this.name].properties[name].validations[condition] =
        new model.ValidationDescription(condition, reference, opts);
  };

  // For each of the validators, create a validatesFooBar from
  // validates('fooBar' ...
  for (var p in model.validators) {
    this['validates' + utils.string.capitalize(p)] = _createValidator(p);
  }

  // Add the base model properties -- these should not be handled by user input
  if (model.config.useTimestamps) {
    this.property('createdAt', 'datetime', {isSystem: true});
    this.property('updatedAt', 'datetime', {isSystem: true});
  }

  ['hasMany', 'hasOne', 'belongsTo'].forEach(function (assnKey) {
    self[assnKey] = function (name, options) {
      var opts = options || {}
        , assn = reg[self.name].associations[assnKey] || {}
        , assnName = name
        , modelName = opts.model || name;

      // Normalize inflection; we don't care which they use
      assnName = utils.string.getInflection(assnName, 'constructor', 'singular');
      modelName = utils.string.getInflection(modelName, 'constructor', 'singular');

      assn[assnName] = {
        name: assnName
      , model: modelName
      , through: opts.through
      , type: assnKey
      };

      reg[self.name].associations[assnKey] = assn;

      // Set up foreign keys
      var createForeignKey = function (assnName) {
        return function () {
          var ownerModelName
            , ownedModelName
            , idKey
            , datatype
            , def;

          if (assnKey == 'belongsTo') {
            ownerModelName = modelName;
            ownedModelName = self.name;
            idKey = modelName;
          }
          else {
            ownerModelName = self.name;
            ownedModelName = modelName;
            idKey = self.name;
          }

          if (assnName == modelName) {
            idKey = utils.string.decapitalize(idKey) + 'Id'
          }
          else {
            idKey = utils.string.decapitalize(assnName) + idKey  + 'Id'
          }

          if (!reg[ownedModelName]) {
            throw new Error('Model ' + ownedModelName + ' does not exist.');
          }

          if (!reg[ownedModelName].properties[idKey]) {
            def = model[ownerModelName];
            datatype = model.config.autoIncrementId ? 'int' : 'string';

            reg[ownedModelName].properties[idKey] =
              new model.PropertyDescription(idKey, datatype);
          }
        }
      };

      // Set up foreign keys except in the case of virtual 'throughs'
      // FIXME: Hack, let other models get defined first
      // Should probably listen for an event that signals
      // base models are set up
      if (!opts.through) {
        _foreignKeyCreators.push(createForeignKey(assnName));
      }
    };
  });
};

model.ModelDescription = function (name) {
  this.name = name;
  this.properties = {};
  this.associations = {};
};

model.PropertyDescription = function (name, datatype, o) {
  var opts = o || {}
    , validations = {}
    , validationOpts = utils.mixin({}, opts);

  delete validationOpts.required;
  delete validationOpts.length;
  delete validationOpts.format;

  this.name = name;
  this.datatype = datatype;
  this.options = opts;

  // Creates results similar to `this.validates`, above in ModelDefinitionBase
  // Would be great to remove the duplication of logic
  for (var p in opts) {
    if (opts.required || opts.length) {
      validations.present =
          new model.ValidationDescription('present', null, validationOpts);
    }
    if (opts.length) {
      if (typeof opts.length == 'object') {
      // {min: 1, max: 2} or {is: 3}
      validations.length =
          new model.ValidationDescription('length', null,
              utils.mixin(opts.length, validationOpts));
      }
      // 1 or '1'
      else {
      validations.length =
          new model.ValidationDescription('length', null,
              utils.mixin({is: opts.length}, validationOpts));
      }
    }
    if (opts.format) {
      validations.format =
          new model.ValidationDescription('length', opts.format,
              validationOpts);
    }
  }
  this.validations = validations;
};

model.ValidationDescription = function (type, reference, opts) {
  this.type = type;
  this.reference = reference;
  this.opts = opts || {};
};

module.exports = model;

// Load last, these depend on index.js
Query = require('./query/query').Query;
model.datatypes = require('./datatypes');
association = require('./association');


},{"./adapters":3,"./association":6,"./base_config":7,"./datatypes":8,"./formatters":9,"./migration":12,"./query/query":16,"./validators":17,"events":40,"util":69,"utilities":25}],12:[function(require,module,exports){
var Migration = require('./migration').Migration;

var migration = new (function () {


})();

migration.Migration = Migration;

module.exports = migration;

},{"./migration":13}],13:[function(require,module,exports){

var utils = require('utilities')
  , Generator = require('../generators/sql').Generator
  , Migration
  , Columnator
  , defaultAdapter = null;

Migration = function (name, adapter) {
  this.name = name;
  this.adapter = adapter || defaultAdapter;
  this.generator = this.adapter.generator;
};

Migration.prototype = new (function () {

  this.up = function (next) {
    next();
  };

  this.down = function (next) {
    next();
  };

  // ALTER TABLE distributors ADD COLUMN address varchar(30);
  this.addColumn = function (/* table, column, datatype, [options], cb*/) {
    var args = Array.prototype.slice.call(arguments)
      , sql = ''
      , table = args.shift()
      , column = args.shift()
      , datatype = args.shift()
      , cb = args.pop()
      , opts = args.pop() || {} // Optional

    sql = this.generator.alterTableStatement(table, {
      operation: 'add'
    , property: {
        name: column
      , datatype: datatype
      }
    });
    this.adapter.exec(sql, cb);
  };

  // ALTER TABLE distributors DROP COLUMN address;
  this.removeColumn = function (table, column, cb) {
    var sql = this.generator.alterTableStatement(table, {
      operation: 'drop'
    , property: {
        name: column
      }
    });
    this.adapter.exec(sql, cb);
  };

  // TODO
  this.addIndex = function (table, column, options, cb) {};

  // ALTER TABLE distributors ALTER COLUMN address TYPE varchar(30);
  this.changeColumn = function (table, column, datatype, options, cb) {
    var args = Array.prototype.slice.call(arguments)
      , sql = ''
      , table = args.shift()
      , column = args.shift()
      , datatype = args.shift()
      , cb = args.pop()
      , opts = args.pop() || {} // Optional

    sql = this.generator.alterTableStatement(table, {
      operation: 'alter'
    , property: {
        name: column
      , datatype: datatype
      }
    });
    this.adapter.exec(sql, cb);
  };

  // ALTER TABLE distributors RENAME COLUMN address TO city;
  this.renameColumn = function (table, column, newColumn, cb) {
    var sql = this.generator.alterTableStatement(table, {
      operation: 'rename'
    , property: {
        name: column
      , newName: newColumn
      }
    });
    this.adapter.exec(sql, cb);
  };

  // CREATE TABLE distributors (did integer, name varchar(40));
  this.createTable = function (/*name, [opts], [definition], cb*/) {
    // FIXME: Shouldn't have to late-require 'model' here
    // Why is order of loading a problem here?
    var model = require('../index')
      , args = Array.prototype.slice.call(arguments)
      , arg
      , sql = ''
      , name = args.shift()
      , opts = {}
      , definition = function () {}
      , cb = args.pop()
      , col = new Columnator();

    // Optional opts/callback or callback/opts
    while ((arg = args.pop())) {
      if (typeof arg == 'function') {
        definition = arg;
      }
      else {
        opts = arg;
      }
    }

    definition(col);

    if (model.config.useTimestamps) {
      col.cols.createdAt = {
        name: 'createdAt'
      , datatype: 'datetime'
      };
      col.cols.updatedAt = {
        name: 'updatedAt'
      , datatype: 'datetime'
      };
    }

    sql = this.generator.createTableStatement(name, col.cols);
    this.adapter.exec(sql, cb);
  };

  // DROP TABLE IF EXISTS distributors;
  this.dropTable = function (name, cb) {
    var sql = this.generator.dropTableStatement(name);
    this.adapter.exec(sql, cb);
  };

  // TODO
  this.removeIndex = function (table, column, cb) {};

})();

Migration.setDefaultAdapter = function (adapter) {
  defaultAdapter = adapter;
};

Columnator = function () {
  this.cols = {};
};
Columnator.prototype = new (function () {

  this.column = function (name, datatype) {
    this.cols[name] = {
      name: name
    , datatype: datatype
    };
  };

})();

exports.Migration = Migration;

},{"../generators/sql":10,"../index":11,"utilities":25}],14:[function(require,module,exports){
var utils = require('utilities')
  , datatypes = require('../datatypes')
  , comparison = {}
  , ComparisonBase
  , comparisonTypes
  , _validateForDatatype;

_validateForDatatype = function (val) {
  var validator = datatypes[this.datatype].validate
    , validated = validator(this.field, val, {});
  return !validated.err;
};

comparison.create = function () {
  var args = Array.prototype.slice.call(arguments)
    , type = args.shift()
    , ctor = utils.string.capitalize(type) + 'Comparison'
    , inst;

    ctor = comparisonTypes[ctor];
    inst = new ctor();
    inst.type = type;
    inst.initialize.apply(inst, args);
    return inst;
};

ComparisonBase = function () {
  this.initialize = function (model, field, value, datatype, opts) {
    this.parent = null;
    this.descendants = [];
    // FIXME: Should use Property objects
    this.model = model;
    this.field = field;
    this.value = value;
    this.datatype = datatype;
    this.opts = opts || {};
  };

  // Most basic validation is to check that the value for the
  // comparison is actually valid for this field
  this.isValid = function () {
    return _validateForDatatype.apply(this, [this.value]);
  };
};

comparisonTypes = {
  EqualToComparison: function () {
    this.jsComparatorString = '==';
    this.sqlComparatorString = '=';
  }

, NotEqualToComparison: function () {
    this.jsComparatorString = '!=';
    this.sqlComparatorString = '!=';
  }

, GreaterThanComparison: function () {
    this.jsComparatorString = '>';
    this.sqlComparatorString = '>';
  }

, LessThanComparison: function () {
    this.jsComparatorString = '<';
    this.sqlComparatorString = '<';
  }

, GreaterThanOrEqualComparison: function () {
    this.jsComparatorString = '>=';
    this.sqlComparatorString = '>=';
  }

, LessThanOrEqualComparison: function () {
    this.jsComparatorString = '<=';
    this.sqlComparatorString = '<=';
  }

, InclusionComparison: function () {
    this.sqlComparatorString = 'IN';

    this.isValid = function () {
      var self = this
        , val = this.value;
      if (!Array.isArray(val)) {
        return false;
      }
      return val.every(function (item) {
        return _validateForDatatype.apply(self, [item]);
      });
    };
  }

, LikeComparison: function () {
    this.sqlComparatorString = 'LIKE';

    this.isValid = function () {
      if (!(this.datatype == 'string' || this.datatype == 'text')) {
        return false;
      }
      return this.constructor.prototype.isValid.call(this);
    };
  }

};

(function () {
  var ctor;
  for (var t in comparisonTypes) {
    ctor = comparisonTypes[t];
    ctor.prototype = new ComparisonBase();
    ctor.prototype.constructor = ctor;
  }
})();

// Export the specific constructors as well as the `create` function
utils.mixin(comparison, comparisonTypes);

module.exports = comparison;



},{"../datatypes":8,"utilities":25}],15:[function(require,module,exports){
var utils = require('utilities')
  , operation = {}
  , OperationBase
  , operationTypes;

operation.create = function () {
  var args = Array.prototype.slice.call(arguments)
    , type = args.shift()
    , ctor = utils.string.capitalize(type) + 'Operation'
    , inst;

    ctor = operationTypes[ctor];
    inst = new ctor();
    inst.type = type;
    inst.initialize.apply(inst, args);
    return inst;
};


OperationBase = function () {

  this.initialize = function () {
    var operands = Array.prototype.slice.call(arguments);

    this.parent = null;
    this.descendants = [];
    this.operands = [];

    this.merge(operands);
  };

  this.forEach = function (f) {
    this.operands.forEach(f);
  };

  this.isEmpty = function () {
    return !this.operands.length;
  };

  this.isValid = function () {
    var self = this;
    return (!this.isEmpty() && this.operands.every(function (op) {
      return self.validOperand(op);
    }));
  };

  this.validOperand = function (op) {
    return typeof op.isValid == 'function' ?
      op.isValid() : true;
  };

  this.add = function (operand) {
    // Flatten if same type, to create a shallower tree
    if (operand.type == this.type) {
      this.merge(operand.operands);
    }
    else {
      this.operands.push(operand);
      operand.parent = this;
    }
  };

  // Can take args or a single array-arg
  this.merge = function (operands) {
    var self = this
      , ops = Array.isArray(operands) ?
        operands : Array.prototype.slice.call(arguments);
    ops.forEach(function (op) {
      self.add(op);
    });
  };

  this.union = function (other) {
    return (create('or', this, other)).minimize();
  };

  this.intersection  = function () {
    return (create('and', this, other)).minimize();
  };

  this.difference = function () {
    return (create('and', this, create('not', other))).minimize();
  };

  this.minimize = function () {
    return this;
  };

  this.clear = function () {
    this.operands = [];
  };

  this.minimizeOperands = function () {
    var self = this;
    this.operands = this.operands.map(function (op) {
      var min = typeof op.minimize == 'function' ?
          op.minimize() : op;
      min.parent = self;
      return min;
    });
  };

  this.pruneOperands = function () {
    this.operands = this.operands.filter(function (op) {
      return typeof op.isEmpty == 'function' ?
        !op.isEmpty() : true;
    });
  };

  // FIXME: Is this needed?
  this.isNull = function () {
    return false;
  };

};

operationTypes = {
  AndOperation: function () {

    this.matches = function (record) {
      return this.operands.every(function (op) {
        return typeof op.matches == 'function' ?
          op.matches(record) : true;
      });
    };

    this.minimize = function () {
      this.minimizeOperands();

      if (!this.isEmpty() && this.operands.every(function (op) {
        return op.isNull();
      })) {
        return create('null');
      }

      this.pruneOperands();

      if (this.operands.length == 1) {
        return this.operands[0];
      }
      return this;
    };
  }

, OrOperation: function () {

    this.matches = function (record) {
      return this.operands.some(function (op) {
        return typeof op.matches == 'function' ?
          op.matches(record) : true;
      });
    }

    this.isValid = function () {
      var self = this;
      return (!this.isEmpty() && this.operands.some(function (op) {
        return self.validOperand(op);
      }));
    };

    this.minimize = function () {
      this.minimizeOperands();

      if (!this.isEmpty() && this.operands.some(function (op) {
        return op.isNull();
      })) {
        return create('null');
      }

      this.pruneOperands();

      if (this.operands.length == 1) {
        return this.operands[0];
      }
      return this;
    };
  }

, NotOperation: function () {
    this.add = function (operand) {
      // Assert there's only one operand
      if (this.operands.length) {
        throw new Error('Not operation can only have one operand.');
      }
      // Assert that the single operand isn't a self-reference
      if (this.operand === this) {
        throw new Error('Operand for Not operation can\'t be a self-reference.');
      }
      this.constructor.prototype.add.apply(this, arguments);
    };

    this.minimize = function () {
      var operand
      this.minimizeOperands();
      this.pruneOperands();
      // Try to factor out double negatives
      operand = this.operand();
      if (operand && operand instanceof operationTypes.NotOperation) {
        return this.operands[0].operand;
      }
      else {
        return this;
      }
    };

    this.operand = function () {
      return this.operands.length == 1 && this.operands[0];
    };

    // FIXME: "Defaults to false"?
    this.isNegated = function () {
      var parent = this.parent;
      return !!parent ? parent.isNegated() : true;
    };
  }

, NullOperation: function () {

    // TODO: Make sure it's either a Hash or a Resource
    this.matches = function (resource) {
      return true;
    };

    this.isValid = function () {
      return true;
    };

    this.isNull = function () {
      return true;
    };

  }
};

(function () {
  var ctor;
  for (var t in operationTypes) {
    ctor = operationTypes[t];
    ctor.prototype = new OperationBase();
    ctor.prototype.constructor = ctor;
  }
})();

// Export the specific constructors as well as the `create` function
utils.mixin(operation, operationTypes);
operation.OperationBase = OperationBase;

module.exports = operation;


},{"utilities":25}],16:[function(require,module,exports){

var query = {}
  , Query
  , utils = require('utilities')
  , model = require('../index')
  , operation = require('./operation')
  , comparison = require('./comparison');

Query = function (model, conditions, options) {
  this.model = null;
  this.conditions = null;
  this.initialize.apply(this, arguments);
};

Query.comparisonTypes = {
  'eql': 'EqualTo'
, 'ne': 'NotEqualTo'
, 'in': 'Inclusion'
, 'like': 'Like'
, 'gt': 'GreaterThan'
, 'lt': 'LessThan'
, 'gte': 'GreaterThanOrEqual'
, 'lte': 'LessThanOrEqual'
};

Query.prototype = new (function () {

  var _operationTypes = {
        'and': true
      , 'or': true
      , 'not': true
      , 'null': true
      }

    , _isQueryObject = function (obj) {
        // Just generic query object -- not null, Date, or Boolean, or Array
        return (obj && typeof obj == 'object' && !(obj instanceof Date) &&
            !(obj instanceof Boolean) && !Array.isArray(obj));
      }

    , _extractComparisonType = function (obj) {
        // Just generic query object -- not null, Date, or Boolean
        if (_isQueryObject(obj)) {
          // Return any valid comparison type used as key
          for (var p in obj) {
            if (Query.comparisonTypes[p]) {
              return p;
            }
          }
        }
      }

    , _createFieldValidator = function () {
        var self = this
          , baseProps = {
              id: true
            , createdAt: true
            , updatedAt: true
            };
        return function (k) {
          var keyName = k
            , keyNameArr
            , modelName
            , reg
            , assnTokens = [];

          // Users.loginId, Teams.name
          // Sort on nested association property
          modelName = self.model.modelName

          // Walks through the associations and updates modelName
          // until we reach the property name
          if (keyName.indexOf('.') > -1) {
            keyNameArr = keyName.split('.');

            while(keyNameArr.length > 1) {
              var tempAssnName = keyNameArr.shift()
                , assn = model.getAssociation(modelName, tempAssnName)

              assnTokens.push(tempAssnName)

              if(!assn) {
                throw new Error('The association "' + tempAssnName + '" is not a valid ' +
                                'property on the ' + modelName + ' model.');
              }
              else {
                modelName = assn.model
              }
            }

            keyName = keyNameArr[0]
          }

          reg = model.descriptionRegistry[modelName].properties;

          if (baseProps[keyName] || reg[keyName]) {
            return {
              modelName: modelName
            , propertyName: keyName
            , assnTokens: assnTokens
            };
          }
          else {
            return null;
          }
        };
      }

    , _createOperation = function (conditions, key) {
        var self = this
          , type = key || 'and'
          , cond
          , item
          , op = operation.create(type)
          , notOperand
          , operand
          , keys;

        // TODO: Handle associations
        for (var k in conditions) {
          cond = conditions[k];

          // Operation type, can contain other operations/conditions
          if (_operationTypes[k]) {
            // Base operation-type to create: if the type is a 'not',
            // create a single 'and' with the same conditions to wrap
            // in a 'not'
            type = k == 'not' ? 'and' : k;

            // If the conditions are an array, create a single 'and'
            // op that wraps each set of conditions in each item, and
            // add to the wrapper
            if (Array.isArray(cond)) {
              // Create empty wrapper
              operand = operation.create(type);
              cond.forEach(function (c) {
                operand.add(_createOperation.apply(self, [c, 'and']));
              });
            }
            // Simple object-literal, just create an operation
            else {
              operand = _createOperation.apply(this, [cond, type]);
            }

            // If this was a 'not' operation, create a wrapping 'not'
            // to contain the single operation created
            if (k == 'not') {
              notOperand = operation.create(k);
              notOperand.add(operand);
              operand = notOperand;
            }
          }
          // Condition, may be leaf-node or multiple comparisions
          // ANDed on the same field
          else {
            // Exclude null, exclude array-values, only consider actual objects
            if (_isQueryObject(cond)) {
              keys = Object.keys(cond);
            }
            // If there are multiple keys, means it's multiple comparisons on
            // the same field
            if (keys && keys.length > 1) {
              // Create wrapper operation
              operand = operation.create('and');
              // Go through each of the comparision keys in the object
              // and create single comparisions which can be ANDed together.
              // E.g.: {foo: {gte: 1, lte: 5}} =>
              // {and: [{foo: {gte: 1}}, {foo: {lte: 5}}]}
              keys.forEach(function (kk) {
                var q = {};
                q[k] = {};
                q[k][kk] = cond[kk];
                if (!Query.comparisonTypes[kk]) {
                  throw new Error(kk + ' is not a valid type of comparison');
                }
                operand.add(_createOperation.apply(self, [q, 'and']));
              });
            }
            // Simple condition (leaf-node)
            // {foo: {ne: 'asdf'} or {foo: 1} or {foo: [1, 2, 3]}
            else {
              operand = _createComparison.apply(this, [cond, k]);
            }
          }

          op.add(operand);
        }
        return op;
      }

    , _createComparison = function (val, key) {
        var type
          , keyName = key
          , keyNameArr
          , modelName
          , props
          , descr
          , datatype
          , opts
          , assnTokens = [];

        modelName = this.model.modelName

        // Walks through the associations and updates modelName
        // until we reach the property name
        if (keyName.indexOf('.') > -1) {
          keyNameArr = keyName.split('.');
          modelName = this.model.modelName;

          while(keyNameArr.length > 1) {
            var tempAssnName = keyNameArr.shift()
              , assn = model.getAssociation(modelName, tempAssnName)

            assnTokens.push(tempAssnName)

            if(!assn) {
              throw new Error('The association "' + tempAssnName + '" is not a valid ' +
                              'property on the ' + modelName + ' model.');
            }
            else {
              modelName = assn.model
            }
          }

          keyName = keyNameArr[0]
        }

        props = model.descriptionRegistry[modelName].properties;
        descr = props[keyName];

          // {id: ['foo', 'bar', 'baz']}, shorthand for Inclusion
        if (Array.isArray(val)) {
          type = 'in';
        }
        else {
          // Single query objects -- not null, Date, Boolean
          // e.g., {id: {'like': 'foo'}}
          type = _extractComparisonType(val);
          if (type) {
            val = val[type];
          }
          // Simple scalar value, default to equality
          else {
            type = 'eql';
          }
        }

        // FIXME: How the fuck to handle IDs?
        // id isn't in the defined props
        if (keyName == 'id') {
          if (model.config.autoIncrementId) {
            datatype = 'int';
          }
          else {
            datatype = 'string';
          }
        }
        else {
          if (typeof descr === 'undefined') {
            throw new Error('The property "' + keyName + '" is not a valid ' +
                            'property on the ' + modelName + ' model.');
          }

          datatype = descr.datatype;
        }

        opts = _createComparisonOpts.apply(this, [keyName, datatype, assnTokens]);

        // TODO: Validate the value for both the particular field
        // (e.g., must be a numeric) and the type of comparison
        // (e.g., 'IN' must be a collection, etc)
        return comparison.create(Query.comparisonTypes[type], modelName,
            keyName, val, datatype, opts);
      }

    , _createComparisonOpts = function (key, datatype, assnTokens) {
        var opts = this.opts
          , nocase = opts.nocase
          , ret = {};
        if (nocase && (datatype == 'string' || datatype == 'text')) {
          if (Array.isArray(nocase)) {
            if (nocase.some(function (o) {
              return o == key;
            })) {
              ret.nocase = true;
            }
          }
          else {
            ret.nocase = true;
          }
        }

        if(Array.isArray(assnTokens) && assnTokens.length) {
          ret.assnTokens = assnTokens
        }

        return ret;
      }

    , _parseOpts = function (options) {
        var opts = options || {}
          , ret = {}
          , val
          , parsed
          , validatedField
          , validated = {}
          , defaultDir = 'asc';
        for (var prop in opts) {
          val = opts[prop];
          switch (prop) {
            case 'sort':
              // 'foo,bar,baz'
              if (typeof val == 'string') {
                val = val.split(',');
              }
              // ['foo', 'bar', 'baz']
              if (Array.isArray(val)) {
                parsed = {};
                val.forEach(function (v) {
                  parsed[v] = defaultDir;
                });
              }
              else {
                parsed = val;
              }
              // Now there's a well-formed obj, validate fields
              for (var p in parsed) {
                val = parsed[p].toLowerCase();
                validatedField = this.getValidField(p);
                if (!validatedField) {
                  throw new Error(p + ' is not a valid field for ' +
                      this.model.modelName);
                }
                if (!(val == 'asc' || val == 'desc')) {
                  throw new Error('Sort directon for ' + p +
                      ' field on ' + validatedField.modelName + ' must be ' +
                      'either "asc" or "desc"');
                }
                if (validatedField.assnTokens.length) {
                  var temp = validatedField.assnTokens.concat(validatedField.propertyName).join('.');
                  validated[temp] = val;
                }
                else {
                  validated[p] = val;
                }
              }
              ret[prop] = validated;
              break;
            case 'limit':
            case 'skip':
              if (isNaN(val)) {
                throw new Error('"' + prop + '" must be a number.');
              }
              ret[prop] = Number(val);
              break;
            default:
              ret[prop] = val;
          }
        }
        return ret;
      }

    // If there's an 'id' property in the top-level of the query
    // object, allow non-relational stores to optimize
    , _isByIdQuery = function (params) {
        // Don't optimize if there is more than one property
        if(Object.keys(params).length > 1) {
          return null;
        }
        // Don't optimize if it's a list of ids
        if (Array.isArray(params.id)) {
          return null;
        }
        return params.id ? params.id : null;
      };

  this.initialize = function (model, conditionParams, opts) {
    this.model = model;
    this.byId = _isByIdQuery(conditionParams);
    this.getValidField = _createFieldValidator.apply(this);
    this.opts = _parseOpts.apply(this, [opts || {}]);
    this.conditions = _createOperation.apply(this, [conditionParams]);
    this.rawConditions = conditionParams;
  };

})();

query.Query = Query;

module.exports = query;

},{"../index":11,"./comparison":14,"./operation":15,"utilities":25}],17:[function(require,module,exports){
/*
 * Geddy JavaScript Web development framework
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/

var utils = require('utilities')
  , i18n = utils.i18n
  , validators = {}
  , baseValidators
  , createScenarioWrappedValidator;

/*
 * Basic validators -- name is the field name, params is the entire params
 * collection (needed for stuff like password confirmation so it's possible
 * to compare with other field values, and the rule is the data for this
 * particular validation
 * Rules can look like this:
 * present: {opts: {message: 'Gotta be here'}}
 * length: {opts: {min: 2, max: 12}}
 * withFunction: {reference: function (s) { return true },
 *    message: 'Something is wrong'}
 */
baseValidators = {
  present: function (name, val, params, rule, locale) {
    var msg;
    if (utils.isEmpty(val)) {
      //'Field "' + name + '" is required.';
      msg = rule.opts.message || i18n.getText('model.validatesPresent',
        {name: name}, locale);
    }
    return msg;
  },

  absent: function (name, val, params, rule, locale) {
    var msg;
    if (val) {
      //return rule.opts.message || 'Field "' + name + '" must not be filled in.';
      msg = rule.opts.message || i18n.getText('model.validatesAbsent',
        {name: name}, locale);
    }
    return msg;
  },

  confirmed: function (name, val, params, rule, locale) {
    var qual = rule.reference
      , msg;
    if (val != params[qual]) {
      //return rule.opts.message || 'Field "' + name + '" and field "' + qual +
      //    '" must match.';
      msg = rule.opts.message || i18n.getText('model.validatesConfirmed',
        {name: name, qual: qual}, locale);
    }
    return msg;
  },

  format: function (name, val, params, rule, locale) {
    var msg;
    if (!rule.reference.test(val)) {
      //return rule.opts.message || 'Field "' + name + '" is not correctly formatted.';
      msg = rule.opts.message || i18n.getText('model.validatesFormat',
        {name: name}, locale);
    }
    return msg;
  },

  length: function (name, val, params, rule, locale) {
    var qual = rule.opts
      , validQualifier = false
      , err
      , msg
      , numVal
      , errMsg = 'validatesLength must be set to a integer ' +
            'or object with min/max integer properties.';

    // If a specific length is wanted, there has to be a value
    // in the first place
    if (!val) {
      return rule.opts.message || i18n.getText('model.validatesPresent', {name: name}, locale);
    }

    // Validate that there's a opts to check against
    if (!qual) {
      throw new Error(errMsg);
    }

    // Check if using old API of passing just a number
    if (typeof qual != 'object') {
      qual = {is: qual};
    }

    // First check for an exact length qualifier
    numVal = parseFloat(qual.is);
    if (!isNaN(numVal)) {
      validQualifier = true;
      if (val.length !== numVal) {
        msg = rule.opts.message || i18n.getText('model.validatesExactLength',
          {name: name, is: qual.is}, locale);
      }
    }
    else {
      numVal = parseFloat(qual.min);
      if (!isNaN(numVal)) {
        validQualifier = true;
        if (val.length < numVal) {
          msg = rule.opts.message || i18n.getText('model.validatesMinLength',
            {name: name, min: qual.min}, locale);
        }
      }
      // Still valid, check for a max
      if (!msg) {
        numVal = parseFloat(qual.max);
        if (!isNaN(numVal)) {
          validQualifier = true;
          if (val.length > numVal) {
          msg = rule.opts.message || i18n.getText('model.validatesMaxLength',
            {name: name, max: qual.max}, locale);
          }
        }
      }
    }

    if (!validQualifier) {
      throw new Error(errMsg);
    }

    return msg;
  },

  withFunction: function (name, val, params, rule, locale) {
    var func = rule.reference
      , msg;
    if (typeof func != 'function') {
      throw new Error('withFunction validator for field "' + name +
          '" must be a function.');
    }
    
    var resultValidation = func(val, params);
    if (typeof resultValidation === typeof "") {
      msg = resultValidation;
    } 
    else if (!resultValidation) {
        //return rule.opts.message || 'Field "' + name + '" is not valid.';
        msg = rule.opts.message || i18n.getText('model.validatesWithFunction',
          {name: name}, locale);
    }

    return msg;
  }
};

createScenarioWrappedValidator = function (baseValidator) {
  return function (name, val, params, rule, locale) {
    var validScenarios = rule.opts && rule.opts.on
      , scenario = rule.scenario
      , shouldValidate = false;

    // By default, we should validate on all scenarios
    if (!validScenarios) {
      shouldValidate = true;
    }

    // If the user specified scenarios
    if (!shouldValidate) {
      // Accept strings too
      if (! validScenarios instanceof Array) {
        validScenarios = [validScenarios];
      }

      // Normalize the input
      for(var i=0, ii=validScenarios.length; i < ii; i++) {
        validScenarios[i] = validScenarios[i].toLowerCase();
      }

      // Scenario might be undefined here, but don't hide the error as
      // we should always validate with a scenario in mind lest something
      // unexpected happen.
      shouldValidate = validScenarios.indexOf(scenario.toLowerCase()) >= 0;
    }

    if (shouldValidate) {
      return baseValidator(name, val, params, rule, locale);
    }
    else {
      return null;
    }
  }
};

// Wrap all the base validators in a scenario-aware wrapper
for (var key in baseValidators) {
  validators[key] = createScenarioWrappedValidator(baseValidators[key]);
}

module.exports = validators;

},{"utilities":25}],18:[function(require,module,exports){
/*
 * Utilities: A classic collection of JavaScript utilities
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/

/**
  @name array
  @namespace array
*/

var array = new (function () {

  /**
    @name array#humanize
    @public
    @function
    @return {String} A string containing the array elements in a readable format
    @description Creates a string containing the array elements in a readable format
    @param {Array} array The array to humanize
  */
  this.humanize = function (array) {
    // If array only has one item then just return it
    if (array.length <= 1) {
      return String(array);
    }

    var last = array.pop()
      , items = array.join(', ');

    return items + ' and ' + last;
  };

  /**
    @name array#included
    @public
    @function
    @return {Array/Boolean} If `item` is included the `array` is
      returned otherwise false
    @description Checks if an `item` is included in an `array`
    @param {Any} item The item to look for
    @param {Array} array The array to check
  */
  this.included = function (item, array) {
    var result = array.indexOf(item);

    if (result === -1) {
      return false;
    } else {
      return array;
    }
  };

  /**
    @name array#include
    @public
    @function
    @return {Boolean} Return true if the item is included in the array
    @description Checks if an `item` is included in an `array`
    @param {Array} array The array to check
    @param {Any} item The item to look for
  */
  this.include = function (array, item) {
    var res = -1;
    if (typeof array.indexOf == 'function') {
      res = array.indexOf(item);
    }
    else {
      for (var i = 0, ii = array.length; i < ii; i++) {
        if (array[i] == item) {
          res = i;
          break;
        }
      }
    }
    return res > -1;
  };

})();

module.exports = array;

},{}],19:[function(require,module,exports){
(function (process){
/*
 * Utilities: A classic collection of JavaScript utilities
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/

var async = {};

/*
AsyncChain -- performs a list of asynchronous calls in a desired order.
Optional "last" method can be set to run after all the items in the
chain have completed.

  // Example usage
  var asyncChain = new async.AsyncChain([
    {
      func: app.trainToBangkok,
      args: [geddy, neil, alex],
      callback: null, // No callback for this action
    },
    {
      func: fs.readdir,
      args: [geddy.config.dirname + '/thailand/express'],
      callback: function (err, result) {
        if (err) {
          // Bail out completely
          arguments.callee.chain.abort();
        }
        else if (result.theBest) {
          // Don't run the next item in the chain; go directly
          // to the 'last' method.
          arguments.callee.chain.shortCircuit();
        }
        else {
          // Otherwise do some other stuff and
          // then go to the next link
        }
      }
    },
    {
      func: child_process.exec,
      args: ['ls ./'],
      callback: this.hitTheStops
    }
  ]);

  // Function to exec after all the links in the chain finish
  asyncChain.last = function () { // Do some final stuff };

  // Start the async-chain
  asyncChain.run();

*/
async.execNonBlocking = function (func) {
  if (typeof process != 'undefined' && typeof process.nextTick == 'function') {
    process.nextTick(func);
  }
  else {
    setTimeout(func, 0);
  }
};

async.AsyncBase = new (function () {

  this.init = function (chain) {
    var item;
    this.chain = [];
    this.currentItem = null;
    this.shortCircuited = false;
    this.shortCircuitedArgs = undefined;
    this.aborted = false;

    for (var i = 0; i < chain.length; i++) {
      item = chain[i];
      this.addItem(item);
    }
  };

  this.addItem = function(item) {
    this.chain.push(new async.AsyncCall(
      item.func, item.args || [], item.callback, item.context));
  };

  // alias
  this.push = this.addItem;

  this.runItem = function (item) {
    // Reference to the current item in the chain -- used
    // to look up the callback to execute with execCallback
    this.currentItem = item;
    // Scopage
    var _this = this;
    // Pass the arguments passed to the current async call
    // to the callback executor, execute it in the correct scope
    var executor = function () {
      _this.execCallback.apply(_this, arguments);
    };
    // Append the callback executor to the end of the arguments
    // Node helpfully always has the callback func last
    var args = item.args.concat(executor);
    var func = item.func;
    // Run the async call
    func.apply(item.context, args);
  };

  this.next = function () {
    if (this.chain.length) {
      this.runItem(this.chain.shift());
    }
    else {
      this.last();
    }
  };

  this.execCallback = function () {
    // Look up the callback, if any, specified for this async call
    var callback = this.currentItem.callback;
    // If there's a callback, do it
    if (callback && typeof callback == 'function') {
      // Allow access to the chain from inside the callback by setting
      // callback.chain = this, and then using arguments.callee.chain
      callback.chain = this;
      callback.apply(this.currentItem.context, arguments);
    }

    this.currentItem.finished = true;

    // If one of the async callbacks called chain.shortCircuit,
    // skip to the 'last' function for the chain
    if (this.shortCircuited) {
      this.last.apply(null, this.shortCircuitedArgs);
    }
    // If one of the async callbacks called chain.abort,
    // bail completely out
    else if (this.aborted) {
      return;
    }
    // Otherwise run the next item, if any, in the chain
    // Let's try not to block if we don't have to
    else {
      // Scopage
      var _this = this;
      async.execNonBlocking(function () { _this.next.call(_this); });
    }
  }

  // Short-circuit the chain, jump straight to the 'last' function
  this.shortCircuit = function () {
    this.shortCircuitedArgs = arguments;
    this.shortCircuited = true;
  }

  // Stop execution of the chain, bail completely out
  this.abort = function () {
    this.aborted = true;
  }

  // Kick off the chain by grabbing the first item and running it
  this.run = this.next;

  // Function to run when the chain is done -- default is a no-op
  this.last = function () {};

})();

async.AsyncChain = function (chain) {
  this.init(chain);
};

async.AsyncChain.prototype = async.AsyncBase;

async.AsyncGroup = function (group) {
  var item;
  var callback;
  var args;

  this.group = [];
  this.outstandingCount = 0;

  for (var i = 0; i < group.length; i++) {
    item = group[i];
    this.group.push(new async.AsyncCall(
        item.func, item.args, item.callback, item.context));
    this.outstandingCount++;
  }

};

/*
Simpler way to group async calls -- doesn't ensure completion order,
but still has a "last" method called when the entire group of calls
have completed.
*/
async.AsyncGroup.prototype = new function () {
  this.run = function () {
    var _this = this
      , group = this.group
      , item
      , createItem = function (item, args) {
          return function () {
            item.func.apply(item.context, args);
          };
        }
      , createCallback = function (item) {
          return function () {
            if (item.callback) {
              item.callback.apply(null, arguments);
            }
            _this.finish.call(_this);
          }
        };

    for (var i = 0; i < group.length; i++) {
      item = group[i];
      callback = createCallback(item);
      args = item.args.concat(callback);
      // Run the async call
      async.execNonBlocking(createItem(item, args));
    }
  };

  this.finish = function () {
    this.outstandingCount--;
    if (!this.outstandingCount) {
      this.last();
    };
  };

  this.last = function () {};

};

var _createSimpleAsyncCall = function (func, context) {
  return {
    func: func
  , args: []
  , callback: function () {}
  , context: context
  };
};

async.SimpleAsyncChain = function (funcs, context) {
  chain = [];
  for (var i = 0, ii = funcs.length; i < ii; i++) {
    chain.push(_createSimpleAsyncCall(funcs[i], context));
  }
  this.init(chain);
};

async.SimpleAsyncChain.prototype = async.AsyncBase;

async.AsyncCall = function (func, args, callback, context) {
  this.func = func;
  this.args = args;
  this.callback = callback || null;
  this.context = context || null;
};

async.Initializer = function (steps, callback) {
  var self = this;
  this.steps = {};
  this.callback = callback;
  // Create an object-literal of the steps to tick off
  steps.forEach(function (step) {
    self.steps[step] = false;
  });
};

async.Initializer.prototype = new (function () {
  this.complete = function (step) {
    var steps = this.steps;
    // Tick this step off
    steps[step] = true;
    // Iterate the steps -- if any are not done, bail out
    for (var p in steps) {
      if (!steps[p]) {
        return false;
      }
    }
    // If all steps are done, run the callback
    this.callback();
  };
})();

module.exports = async;


}).call(this,require("lppjwH"))
},{"lppjwH":48}],20:[function(require,module,exports){
/*
 * Utilities: A classic collection of JavaScript utilities
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/

var core = new (function () {

  var _mix = function (targ, src, merge, includeProto) {
    for (var p in src) {
      // Don't copy stuff from the prototype
      if (src.hasOwnProperty(p) || includeProto) {
        if (merge &&
            // Assumes the source property is an Object you can
            // actually recurse down into
            (typeof src[p] == 'object') &&
            (src[p] !== null) &&
            !(src[p] instanceof Array)) {
          // Create the source property if it doesn't exist
          // Double-equal to undefined includes both null and undefined
          if (targ[p] == undefined) {
            targ[p] = {};
          }
          _mix(targ[p], src[p], merge, includeProto); // Recurse
        }
        // If it's not a merge-copy, just set and forget
        else {
          targ[p] = src[p];
        }
      }
    }
  };

  /*
   * Mix in the properties on an object to another object
   * yam.mixin(target, source, [source,] [source, etc.] [merge-flag]);
   * 'merge' recurses, to merge object sub-properties together instead
   * of just overwriting with the source object.
   */
  this.mixin = function () {
    var args = Array.prototype.slice.apply(arguments),
        merge = false,
        targ, sources;
    if (args.length > 2) {
      if (typeof args[args.length - 1] == 'boolean') {
        merge = args.pop();
      }
    }
    targ = args.shift();
    sources = args;
    for (var i = 0, ii = sources.length; i < ii; i++) {
      _mix(targ, sources[i], merge);
    }
    return targ;
  };

  this.enhance = function () {
    var args = Array.prototype.slice.apply(arguments),
        merge = false,
        targ, sources;
    if (args.length > 2) {
      if (typeof args[args.length - 1] == 'boolean') {
        merge = args.pop();
      }
    }
    targ = args.shift();
    sources = args;
    for (var i = 0, ii = sources.length; i < ii; i++) {
      _mix(targ, sources[i], merge, true);
    }
    return targ;
  };

  // Idea to add invalid number & Date from Michael J. Ryan,
  // http://frugalcoder.us/post/2010/02/15/js-is-empty.aspx
  this.isEmpty = function (val) {
    // Empty string, null or undefined (these two are double-equal)
    if (val === '' || val == undefined) {
      return true;
    }
    // Invalid numerics
    if (typeof val == 'number' && isNaN(val)) {
      return true;
    }
    // Invalid Dates
    if (val instanceof Date && isNaN(val.getTime())) {
      return true;
    }
    return false;
  };

  /*
  binds a function to an object
   */
  this.bind = function () {
    var args = Array.prototype.slice.call(arguments)
      , ctxt = args.shift()
      , fn = args.shift();

    if (typeof fn === 'function') {
      if (typeof Function.bind === 'function') {
        return fn.bind.apply(ctxt, args);
      }
      else {
        return fn.apply(ctxt, args);
      }
    }
    // in IE, native methods are not functions so they cannot be bound,
    // and don't need to be
    else {
      return fn;
    }
  }
})();

module.exports = core;

},{}],21:[function(require,module,exports){
/*
 * Utilities: A classic collection of JavaScript utilities
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/

var string = require('./string')
  , date
  , log = require('./log');

/**
  @name date
  @namespace date
*/

date = new (function () {
  var _this = this
    , _date = new Date();

  var _US_DATE_PAT = /^(\d{1,2})(?:\-|\/|\.)(\d{1,2})(?:\-|\/|\.)(\d{4})/;
  var _DATETIME_PAT = /^(\d{4})(?:\-|\/|\.)(\d{1,2})(?:\-|\/|\.)(\d{1,2})(?:T| )?(\d{2})?(?::)?(\d{2})?(?::)?(\d{2})?(?:\.)?(\d+)?(?: *)?(Z|[+-]\d{4}|[+-]\d{2}:\d{2}|[+-]\d{2})?/;
  // TODO Add am/pm parsing instead of dumb, 24-hour clock.
  var _TIME_PAT = /^(\d{1,2})?(?::)?(\d{2})?(?::)?(\d{2})?(?:\.)?(\d+)?$/;

  var _dateMethods = [
      'FullYear'
    , 'Month'
    , 'Date'
    , 'Hours'
    , 'Minutes'
    , 'Seconds'
    , 'Milliseconds'
  ];

  var _isArray = function (obj) {
    return obj &&
      typeof obj === 'object' &&
      typeof obj.length === 'number' &&
      typeof obj.splice === 'function' &&
      !(obj.propertyIsEnumerable('length'));
  };

  this.weekdayLong = ['Sunday', 'Monday', 'Tuesday',
    'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  this.weekdayShort = ['Sun', 'Mon', 'Tue', 'Wed',
    'Thu', 'Fri', 'Sat'];
  this.monthLong = ['January', 'February', 'March',
    'April', 'May', 'June', 'July', 'August', 'September',
    'October', 'November', 'December'];
  this.monthShort = ['Jan', 'Feb', 'Mar', 'Apr',
    'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  this.meridiem = {
    'AM': 'AM',
    'PM': 'PM'
  }
  // compat
  this.meridian = this.meridiem

  /**
    @name date#supportedFormats
    @public
    @object
    @description List of supported strftime formats
  */
  this.supportedFormats = {
    // abbreviated weekday name according to the current locale
    'a': function (dt) { return _this.weekdayShort[dt.getDay()]; },
    // full weekday name according to the current locale
    'A': function (dt) { return _this.weekdayLong[dt.getDay()]; },
    //  abbreviated month name according to the current locale
    'b': function (dt) { return _this.monthShort[dt.getMonth()]; },
    'h': function (dt) { return _this.strftime(dt, '%b'); },
    // full month name according to the current locale
    'B': function (dt) { return _this.monthLong[dt.getMonth()]; },
    // preferred date and time representation for the current locale
    'c': function (dt) { return _this.strftime(dt, '%a %b %d %T %Y'); },
    // century number (the year divided by 100 and truncated
    // to an integer, range 00 to 99)
    'C': function (dt) { return _this.calcCentury(dt.getFullYear());; },
    // day of the month as a decimal number (range 01 to 31)
    'd': function (dt) { return string.lpad(dt.getDate(), '0', 2); },
    // same as %m/%d/%y
    'D': function (dt) { return _this.strftime(dt, '%m/%d/%y') },
    // day of the month as a decimal number, a single digit is
    // preceded by a space (range ' 1' to '31')
    'e': function (dt) { return string.lpad(dt.getDate(), ' ', 2); },
    // month as a decimal number, a single digit is
    // preceded by a space (range ' 1' to '12')
    'f': function () { return _this.strftimeNotImplemented('f'); },
    // same as %Y-%m-%d
    'F': function (dt) { return _this.strftime(dt, '%Y-%m-%d');  },
    // like %G, but without the century.
    'g': function () { return _this.strftimeNotImplemented('g'); },
    // The 4-digit year corresponding to the ISO week number
    // (see %V).  This has the same format and value as %Y,
    // except that if the ISO week number belongs to the
    // previous or next year, that year is used instead.
    'G': function () { return _this.strftimeNotImplemented('G'); },
    // hour as a decimal number using a 24-hour clock (range
    // 00 to 23)
    'H': function (dt) { return string.lpad(dt.getHours(), '0', 2); },
    // hour as a decimal number using a 12-hour clock (range
    // 01 to 12)
    'I': function (dt) { return string.lpad(
      _this.hrMil2Std(dt.getHours()), '0', 2); },
    // day of the year as a decimal number (range 001 to 366)
    'j': function (dt) { return string.lpad(
      _this.calcDays(dt), '0', 3); },
    // Hour as a decimal number using a 24-hour clock (range
    // 0 to 23 (space-padded))
    'k': function (dt) { return string.lpad(dt.getHours(), ' ', 2); },
    // Hour as a decimal number using a 12-hour clock (range
    // 1 to 12 (space-padded))
    'l': function (dt) { return string.lpad(
      _this.hrMil2Std(dt.getHours()), ' ', 2); },
    // month as a decimal number (range 01 to 12)
    'm': function (dt) { return string.lpad((dt.getMonth()+1), '0', 2); },
    // minute as a decimal number
    'M': function (dt) { return string.lpad(dt.getMinutes(), '0', 2); },
    // Linebreak
    'n': function () { return '\n'; },
    // either `am' or `pm' according to the given time value,
    // or the corresponding strings for the current locale
    'p': function (dt) { return _this.getMeridian(dt.getHours()); },
    // time in a.m. and p.m. notation
    'r': function (dt) { return _this.strftime(dt, '%I:%M:%S %p'); },
    // time in 24 hour notation
    'R': function (dt) { return _this.strftime(dt, '%H:%M'); },
    // second as a decimal number
    'S': function (dt) { return string.lpad(dt.getSeconds(), '0', 2); },
    // Tab char
    't': function () { return '\t'; },
    // current time, equal to %H:%M:%S
    'T': function (dt) { return _this.strftime(dt, '%H:%M:%S'); },
    // weekday as a decimal number [1,7], with 1 representing
    // Monday
    'u': function (dt) { return _this.convertOneBase(dt.getDay()); },
    // week number of the current year as a decimal number,
    // starting with the first Sunday as the first day of the
    // first week
    'U': function () { return _this.strftimeNotImplemented('U'); },
    // week number of the year (Monday as the first day of the
    // week) as a decimal number [01,53]. If the week containing
    // 1 January has four or more days in the new year, then it
    // is considered week 1. Otherwise, it is the last week of
    // the previous year, and the next week is week 1.
    'V': function () { return _this.strftimeNotImplemented('V'); },
    // week number of the current year as a decimal number,
    // starting with the first Monday as the first day of the
    // first week
    'W': function () { return _this.strftimeNotImplemented('W'); },
    // day of the week as a decimal, Sunday being 0
    'w': function (dt) { return dt.getDay(); },
    // preferred date representation for the current locale
    // without the time
    'x': function (dt) { return _this.strftime(dt, '%D'); },
    // preferred time representation for the current locale
    // without the date
    'X': function (dt) { return _this.strftime(dt, '%T'); },
    // year as a decimal number without a century (range 00 to
    // 99)
    'y': function (dt) { return _this.getTwoDigitYear(dt.getFullYear()); },
    // year as a decimal number including the century
    'Y': function (dt) { return string.lpad(dt.getFullYear(), '0', 4); },
    // time zone or name or abbreviation
    'z': function () { return _this.strftimeNotImplemented('z'); },
    'Z': function () { return _this.strftimeNotImplemented('Z'); },
    // Literal percent char
    '%': function (dt) { return '%'; }
  };

  /**
    @name date#getSupportedFormats
    @public
    @function
    @description return the list of formats in a string
    @return {String} The list of supported formats
  */
  this.getSupportedFormats = function () {
    var str = '';
    for (var i in this.supportedFormats) { str += i; }
    return str;
  }

  this.supportedFormatsPat = new RegExp('%[' +
      this.getSupportedFormats() + ']{1}', 'g');

  /**
    @name date#strftime
    @public
    @function
    @return {String} The `dt` formated with the given `format`
    @description Formats the given date with the strftime formated
    @param {Date} dt the date object to format
    @param {String} format the format to convert the date to
  */
  this.strftime = function (dt, format) {
    if (!dt) { return '' }

    var d = dt;
    var pats = [];
    var dts = [];
    var str = format;

    // Allow either Date obj or UTC stamp
    d = typeof dt == 'number' ? new Date(dt) : dt;

    // Grab all instances of expected formats into array
    while (pats = this.supportedFormatsPat.exec(format)) {
      dts.push(pats[0]);
    }

    // Process any hits
    for (var i = 0; i < dts.length; i++) {
      key = dts[i].replace(/%/, '');
      str = str.replace('%' + key,
        this.supportedFormats[key](d));
    }
    return str;

  };

  this.strftimeNotImplemented = function (s) {
    throw('this.strftime format "' + s + '" not implemented.');
  };

  /**
    @name date#calcCentury
    @public
    @function
    @return {String} The century for the given date
    @description Find the century for the given `year`
    @param {Number} year The year to find the century for
  */
  this.calcCentury = function (year) {
    if(!year) {
      year = _date.getFullYear();
    }

    var ret = parseInt((year / 100) + 1);
    year = year.toString();

    // If year ends in 00 subtract one, because it's still the century before the one
    // it divides to
    if (year.substring(year.length - 2) === '00') {
      ret--;
    }

    return ret.toString();
  };

  /**
    @name date#calcDays
    @public
    @function
    @return {Number} The number of days so far for the given date
    @description Calculate the day number in the year a particular date is on
    @param {Date} dt The date to use
  */
  this.calcDays = function (dt) {
    var first = new Date(dt.getFullYear(), 0, 1);
    var diff = 0;
    var ret = 0;
    first = first.getTime();
    diff = (dt.getTime() - first);
    ret = parseInt(((((diff/1000)/60)/60)/24))+1;
    return ret;
  };

  /**
   * Adjust from 0-6 base week to 1-7 base week
   * @param d integer for day of week
   * @return Integer day number for 1-7 base week
   */
  this.convertOneBase = function (d) {
    return d == 0 ? 7 : d;
  };

  this.getTwoDigitYear = function (yr) {
    // Add a millenium to take care of years before the year 1000,
    // (e.g, the year 7) since we're only taking the last two digits
    // If we overshoot, it doesn't matter
    var millenYear = yr + 1000;
    var str = millenYear.toString();
    str = str.substr(2); // Get the last two digits
    return str
  };

  /**
    @name date#getMeridiem
    @public
    @function
    @return {String} Return 'AM' or 'PM' based on hour in 24-hour format
    @description Return 'AM' or 'PM' based on hour in 24-hour format
    @param {Number} h The hour to check
  */
  this.getMeridiem = function (h) {
    return h > 11 ? this.meridiem.PM :
      this.meridiem.AM;
  };
  // Compat
  this.getMeridian = this.getMeridiem;

  /**
    @name date#hrMil2Std
    @public
    @function
    @return {String} Return a 12 hour version of the given time
    @description Convert a 24-hour formatted hour to 12-hour format
    @param {String} hour The hour to convert
  */
  this.hrMil2Std = function (hour) {
    var h = typeof hour == 'number' ? hour : parseInt(hour);
    var str = h > 12 ? h - 12 : h;
    str = str == 0 ? 12 : str;
    return str;
  };

  /**
    @name date#hrStd2Mil
    @public
    @function
    @return {String} Return a 24 hour version of the given time
    @description Convert a 12-hour formatted hour with meridian flag to 24-hour format
    @param {String} hour The hour to convert
    @param {Boolean} pm hour is PM then this should be true
  */
  this.hrStd2Mil = function  (hour, pm) {
    var h = typeof hour == 'number' ? hour : parseInt(hour);
    var str = '';
    // PM
    if (pm) {
      str = h < 12 ? (h+12) : h;
    }
    // AM
    else {
      str = h == 12 ? 0 : h;
    }
    return str;
  };

  // Constants for use in this.add
  var dateParts = {
    YEAR: 'year'
    , MONTH: 'month'
    , DAY: 'day'
    , HOUR: 'hour'
    , MINUTE: 'minute'
    , SECOND: 'second'
    , MILLISECOND: 'millisecond'
    , QUARTER: 'quarter'
    , WEEK: 'week'
    , WEEKDAY: 'weekday'
  };
  // Create a map for singular/plural lookup, e.g., day/days
  var datePartsMap = {};
  for (var p in dateParts) {
    datePartsMap[dateParts[p]] = dateParts[p];
    datePartsMap[dateParts[p] + 's'] = dateParts[p];
  }
  this.dateParts = dateParts;

  /**
    @name date#add
    @public
    @function
    @return {Date} Incremented date
    @description Add to a Date in intervals of different size, from
                 milliseconds to years
    @param {Date} dt Date (or timestamp Number), date to increment
    @param {String} interv a constant representing the interval,
    e.g. YEAR, MONTH, DAY.  See this.dateParts
    @param {Number} incr how much to add to the date
  */
  this.add = function (dt, interv, incr) {
    if (typeof dt == 'number') { dt = new Date(dt); }
    function fixOvershoot() {
      if (sum.getDate() < dt.getDate()) {
        sum.setDate(0);
      }
    }
    var key = datePartsMap[interv];
    var sum = new Date(dt);
    switch (key) {
      case dateParts.YEAR:
        sum.setFullYear(dt.getFullYear()+incr);
        // Keep increment/decrement from 2/29 out of March
        fixOvershoot();
        break;
      case dateParts.QUARTER:
        // Naive quarter is just three months
        incr*=3;
        // fallthrough...
      case dateParts.MONTH:
        sum.setMonth(dt.getMonth()+incr);
        // Reset to last day of month if you overshoot
        fixOvershoot();
        break;
      case dateParts.WEEK:
        incr*=7;
        // fallthrough...
      case dateParts.DAY:
        sum.setDate(dt.getDate() + incr);
        break;
      case dateParts.WEEKDAY:
        //FIXME: assumes Saturday/Sunday weekend, but even this is not fixed.
        // There are CLDR entries to localize this.
        var dat = dt.getDate();
        var weeks = 0;
        var days = 0;
        var strt = 0;
        var trgt = 0;
        var adj = 0;
        // Divide the increment time span into weekspans plus leftover days
        // e.g., 8 days is one 5-day weekspan / and two leftover days
        // Can't have zero leftover days, so numbers divisible by 5 get
        // a days value of 5, and the remaining days make up the number of weeks
        var mod = incr % 5;
        if (mod == 0) {
          days = (incr > 0) ? 5 : -5;
          weeks = (incr > 0) ? ((incr-5)/5) : ((incr+5)/5);
        }
        else {
          days = mod;
          weeks = parseInt(incr/5);
        }
        // Get weekday value for orig date param
        strt = dt.getDay();
        // Orig date is Sat / positive incrementer
        // Jump over Sun
        if (strt == 6 && incr > 0) {
          adj = 1;
        }
        // Orig date is Sun / negative incrementer
        // Jump back over Sat
        else if (strt == 0 && incr < 0) {
          adj = -1;
        }
        // Get weekday val for the new date
        trgt = strt + days;
        // New date is on Sat or Sun
        if (trgt == 0 || trgt == 6) {
          adj = (incr > 0) ? 2 : -2;
        }
        // Increment by number of weeks plus leftover days plus
        // weekend adjustments
        sum.setDate(dat + (7*weeks) + days + adj);
        break;
      case dateParts.HOUR:
        sum.setHours(sum.getHours()+incr);
        break;
      case dateParts.MINUTE:
        sum.setMinutes(sum.getMinutes()+incr);
        break;
      case dateParts.SECOND:
        sum.setSeconds(sum.getSeconds()+incr);
        break;
      case dateParts.MILLISECOND:
        sum.setMilliseconds(sum.getMilliseconds()+incr);
        break;
      default:
        // Do nothing
        break;
    }
    return sum; // Date
  };

  /**
    @name date#diff
    @public
    @function
    @return {Number} number of (interv) units apart that
    the two dates are
    @description Get the difference in a specific unit of time (e.g., number
                 of months, weeks, days, etc.) between two dates.
    @param {Date} date1 First date to check
    @param {Date} date2 Date to compate `date1` with
    @param {String} interv a constant representing the interval,
    e.g. YEAR, MONTH, DAY.  See this.dateParts
  */
  this.diff = function (date1, date2, interv) {
    //  date1
    //    Date object or Number equivalent
    //
    //  date2
    //    Date object or Number equivalent
    //
    //  interval
    //    A constant representing the interval, e.g. YEAR, MONTH, DAY.  See this.dateParts.

    // Accept timestamp input
    if (typeof date1 == 'number') { date1 = new Date(date1); }
    if (typeof date2 == 'number') { date2 = new Date(date2); }
    var yeaDiff = date2.getFullYear() - date1.getFullYear();
    var monDiff = (date2.getMonth() - date1.getMonth()) + (yeaDiff * 12);
    var msDiff = date2.getTime() - date1.getTime(); // Millisecs
    var secDiff = msDiff/1000;
    var minDiff = secDiff/60;
    var houDiff = minDiff/60;
    var dayDiff = houDiff/24;
    var weeDiff = dayDiff/7;
    var delta = 0; // Integer return value

    var key = datePartsMap[interv];
    switch (key) {
      case dateParts.YEAR:
        delta = yeaDiff;
        break;
      case dateParts.QUARTER:
        var m1 = date1.getMonth();
        var m2 = date2.getMonth();
        // Figure out which quarter the months are in
        var q1 = Math.floor(m1/3) + 1;
        var q2 = Math.floor(m2/3) + 1;
        // Add quarters for any year difference between the dates
        q2 += (yeaDiff * 4);
        delta = q2 - q1;
        break;
      case dateParts.MONTH:
        delta = monDiff;
        break;
      case dateParts.WEEK:
        // Truncate instead of rounding
        // Don't use Math.floor -- value may be negative
        delta = parseInt(weeDiff);
        break;
      case dateParts.DAY:
        delta = dayDiff;
        break;
      case dateParts.WEEKDAY:
        var days = Math.round(dayDiff);
        var weeks = parseInt(days/7);
        var mod = days % 7;

        // Even number of weeks
        if (mod == 0) {
          days = weeks*5;
        }
        else {
          // Weeks plus spare change (< 7 days)
          var adj = 0;
          var aDay = date1.getDay();
          var bDay = date2.getDay();

          weeks = parseInt(days/7);
          mod = days % 7;
          // Mark the date advanced by the number of
          // round weeks (may be zero)
          var dtMark = new Date(date1);
          dtMark.setDate(dtMark.getDate()+(weeks*7));
          var dayMark = dtMark.getDay();

          // Spare change days -- 6 or less
          if (dayDiff > 0) {
            switch (true) {
              // Range starts on Sat
              case aDay == 6:
                adj = -1;
                break;
              // Range starts on Sun
              case aDay == 0:
                adj = 0;
                break;
              // Range ends on Sat
              case bDay == 6:
                adj = -1;
                break;
              // Range ends on Sun
              case bDay == 0:
                adj = -2;
                break;
              // Range contains weekend
              case (dayMark + mod) > 5:
                adj = -2;
                break;
              default:
                // Do nothing
                break;
            }
          }
          else if (dayDiff < 0) {
            switch (true) {
              // Range starts on Sat
              case aDay == 6:
                adj = 0;
                break;
              // Range starts on Sun
              case aDay == 0:
                adj = 1;
                break;
              // Range ends on Sat
              case bDay == 6:
                adj = 2;
                break;
              // Range ends on Sun
              case bDay == 0:
                adj = 1;
                break;
              // Range contains weekend
              case (dayMark + mod) < 0:
                adj = 2;
                break;
              default:
                // Do nothing
                break;
            }
          }
          days += adj;
          days -= (weeks*2);
        }
        delta = days;

        break;
      case dateParts.HOUR:
        delta = houDiff;
        break;
      case dateParts.MINUTE:
        delta = minDiff;
        break;
      case dateParts.SECOND:
        delta = secDiff;
        break;
      case dateParts.MILLISECOND:
        delta = msDiff;
        break;
      default:
        // Do nothing
        break;
    }
    // Round for fractional values and DST leaps
    return Math.round(delta); // Number (integer)
  };

  /**
    @name date#parse
    @public
    @function
    @return {Date} a JavaScript Date object
    @description Convert various sorts of strings to JavaScript
                 Date objects
    @param {String} val The string to convert to a Date
  */
  this.parse = function (val) {
    var dt
      , matches
      , reordered
      , off
      , posOff
      , offHours
      , offMinutes
      , offSeconds
      , curr
      , stamp
      , utc;

    // Yay, we have a date, use it as-is
    if (val instanceof Date || typeof val.getFullYear == 'function') {
      dt = val;
    }

    // Timestamp?
    else if (typeof val == 'number') {
      dt = new Date(val);
    }

    // String or Array
    else {
      // Value preparsed, looks like [yyyy, mo, dd, hh, mi, ss, ms, (offset?)]
      if (_isArray(val)) {
        matches = val;
        matches.unshift(null);
        matches[8] = null;
      }

      // Oh, crap, it's a string -- parse this bitch
      else if (typeof val == 'string') {
        matches = val.match(_DATETIME_PAT);

        // Stupid US-only format?
        if (!matches) {
          matches = val.match(_US_DATE_PAT);
          if (matches) {
            reordered = [matches[0], matches[3], matches[1], matches[2]];
            // Pad the results to the same length as ISO8601
            reordered[8] = null;
            matches = reordered;
          }
        }

        // Time-stored-in-Date hack?
        if (!matches) {
          matches = val.match(_TIME_PAT);
          if (matches) {
            reordered = [matches[0], 0, 1, 0, matches[1],
                matches[2], matches[3], matches[4], null];
            matches = reordered;
          }
        }

      }

      // Sweet, the regex actually parsed it into something useful
      if (matches) {
        matches.shift(); // First match is entire match, DO NOT WANT

        off = matches.pop();
        // If there's an offset (or the 'Z' non-offset offset), use UTC
        // methods to set everything
        if (off) {
          if (off == 'Z') {
            utc = true;
            offSeconds = 0;
          }
          else {
            utc = false;
            // Convert from extended to basic if necessary
            off = off.replace(/:/g, '');
            // '+0000' will still be zero
            if (parseInt(off, 10) === 0) {
              utc = true;
            }
            else {
              posOff = off.indexOf('+') === 0;
              // Strip plus or minus
              off = off.substr(1);

              offHours = parseInt(off.substr(0, 2), 10);

              offMinutes = off.substr(2, 2);
              if (offMinutes) {
                offMinutes = parseInt(offMinutes, 10);
              }
              else {
                offMinutes = 0;
              }

              offSeconds = off.substr(4, 2);
              if (offSeconds) {
                offSeconds = parseInt(offSeconds, 10);
              }
              else {
                offSeconds = 0;
              }

              offSeconds += (offMinutes * 60)
              offSeconds += (offHours * 60 * 60);
              if (!posOff) {
                offSeconds = 0 - offSeconds;
              }
            }
          }
        }

        dt = new Date(0);

        // Stupid zero-based months
        matches[1] = parseInt(matches[1], 10) - 1;

        // Specific offset, iterate the array and set each date property
        // using UTC setters, then adjust time using offset
        if (off) {
          for (var i = matches.length - 1; i > -1; i--) {
            curr = parseInt(matches[i], 10) || 0;
            dt['setUTC' + _dateMethods[i]](curr);
          }
          // Add any offset
          dt.setSeconds(dt.getSeconds() - offSeconds);
        }
        // Otherwise we know nothing about the offset, just iterate the
        // array and set each date property using regular setters
        else {
          for (var i = matches.length - 1; i > -1; i--) {
            curr = parseInt(matches[i], 10) || 0;
            dt['set' + _dateMethods[i]](curr);
          }
        }
      }

      // Shit, last-ditch effort using Date.parse
      else {
        stamp = Date.parse(val);
        // Failures to parse yield NaN
        if (!isNaN(stamp)) {
          dt = new Date(stamp);
        }
      }

    }

    return dt || null;
  };

  /**
    @name date#relativeTime
    @public
    @function
    @return {String} A string describing the amount of time ago
    the passed-in Date is
    @description Convert a Date to an English sentence representing
    how long ago the Date was
    @param {Date} dt The Date to to convert to a relative time string
    @param {Object} [opts]
      @param {Boolean} [opts.abbreviated=false] Use short strings
      (e.g., '<1m') for the relative-time string
  */
  this.relativeTime = function (dt, options) {
    var opts = options || {}
      , now = opts.now || new Date()
      , abbr = opts.abbreviated || false
      , format = opts.format || '%F %T'
    // Diff in seconds
      , diff = (now.getTime() - dt.getTime()) / 1000
      , ret
      , num
      , hour = 60*60
      , day = 24*hour
      , week = 7*day
      , month = 30*day;
    switch (true) {
      case diff < 60:
        ret = abbr ? '<1m' : 'less than a minute ago';
        break;
      case diff < 120:
        ret = abbr ? '1m' : 'about a minute ago';
        break;
      case diff < (45*60):
        num = parseInt((diff / 60), 10);
        ret = abbr ? num + 'm' : num + ' minutes ago';
        break;
      case diff < (2*hour):
        ret = abbr ? '1h' : 'about an hour ago';
        break;
      case diff < (1*day):
        num = parseInt((diff / hour), 10);
        ret = abbr ? num + 'h' : 'about ' + num + ' hours ago';
        break;
      case diff < (2*day):
        ret = abbr ? '1d' : 'one day ago';
        break;
      case diff < (7*day):
        num = parseInt((diff / day), 10);
        ret = abbr ? num + 'd' : 'about ' + num + ' days ago';
        break;
      case diff < (11*day):
        ret = abbr ? '1w': 'one week ago';
        break;
      case diff < (1*month):
        num = Math.round(diff / week);
        ret = abbr ? num + 'w' : 'about ' + num + ' weeks ago';
        break;
      default:
        ret = date.strftime(dt, format);
        break;
    }
    return ret;
  };

  /**
    @name date#toISO8601
    @public
    @function
    @return {String} A string describing the amount of time ago
    @description Convert a Date to an ISO8601-formatted string
    @param {Date} dt The Date to to convert to an ISO8601 string
  */
  var _pad = function (n) {
    return n < 10 ? '0' + n : n;
  };
  this.toISO8601 = function (dt, options) {
    var opts = options || {}
      , off = dt.getTimezoneOffset()
      , offHours
      , offMinutes
      , str = this.strftime(dt, '%F') + 'T'
          + this.strftime(dt, '%T') + '.'
          + string.lpad(dt.getMilliseconds(), '0', 3);

    if (opts.tz) {
      // Pos and neg numbers are both truthy; only
      // zero is falsy
      if (off && !opts.utc) {
        str += off > 0 ? '-' : '+';
        offHours = parseInt(off / 60, 10);
        str += string.lpad(offHours, '0', 2);
        offMinutes = off % 60;
        if (offMinutes) {
          str += string.lpad(offMinutes, '0', 2);
        }
      }
      else {
        str += 'Z';
      }
    }

    return str;
  };

  // Alias
  this.toIso8601 = this.toISO8601;

  this.toUTC = function (dt) {
    return new Date(
        dt.getUTCFullYear()
      , dt.getUTCMonth()
      , dt.getUTCDate()
      , dt.getUTCHours()
      , dt.getUTCMinutes()
      , dt.getUTCSeconds()
      , dt.getUTCMilliseconds());
  };

})();

module.exports = date;



},{"./log":27,"./string":32}],22:[function(require,module,exports){
/*
 * Utilities: A classic collection of JavaScript utilities
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/

/*
This is a very simple buffer for a predetermined set of events. It is unbounded.
It forwards all arguments to any outlet emitter attached with sync().

Example:
    var source = new Stream()
      , dest = new EventEmitter()
      , buff = new EventBuffer(source)
      , data = '';
    dest.on('data', function (d) { data += d; });
    source.writeable = true;
    source.readable = true;
    source.emit('data', 'abcdef');
    source.emit('data', '123456');
    buff.sync(dest);
*/

/**
  @name EventBuffer
  @namespace EventBuffer
  @constructor
*/

var EventBuffer = function (src, events) {
  // By default, we service the default stream events
  var self = this
    , streamEvents = ['data', 'end', 'error', 'close', 'fd', 'drain', 'pipe'];
  this.events = events || streamEvents;
  this.emitter = src;
  this.eventBuffer = [];
  this.outlet = null;
  this.events.forEach(function (name) {
    self.emitter.addListener(name, function () {
      self.proxyEmit(name, arguments);
    });
  });
};

EventBuffer.prototype = new (function () {
  /**
    @name EventBuffer#proxyEmit
    @public
    @function
    @description Emit an event by name and arguments or add it to the buffer if
                 no outlet is set
    @param {String} name The name to use for the event
    @param {Array} args An array of arguments to emit
  */
  this.proxyEmit = function (name, args) {
    if (this.outlet) {
      this.emit(name, args);
    }
    else {
      this.eventBuffer.push({name: name, args: args});
    }
  };

  /**
    @name EventBuffer#emit
    @public
    @function
    @description Emit an event by name and arguments
    @param {String} name The name to use for the event
    @param {Array} args An array of arguments to emit
  */
  this.emit = function (name, args) {
    // Prepend name to args
    var outlet = this.outlet;
    Array.prototype.splice.call(args, 0, 0, name);
    outlet.emit.apply(outlet, args);
  };

  /**
    @name EventBuffer#sync
    @public
    @function
    @description Flush the buffer and continue piping new events to the outlet
    @param {Object} outlet The emitter to send events to
  */
  this.sync = function (outlet) {
    var buffer = this.eventBuffer
      , bufferItem;
    this.outlet = outlet;
    while ((bufferItem = buffer.shift())) {
      this.emit(bufferItem.name, bufferItem.args);
    }
  };
})();
EventBuffer.prototype.constructor = EventBuffer;

module.exports.EventBuffer = EventBuffer;

},{}],23:[function(require,module,exports){
(function (process){
/*
 * Utilities: A classic collection of JavaScript utilities
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/

var fs = require('fs')
  , path = require('path')
  , DEFAULT_INCLUDE_PAT = /\.(js|coffee|css|less|scss)$/
  , DEFAULT_EXCLUDE_PAT = /\.git|node_modules/
  , logger;

var logger = new (function () {
  var out;
  try {
    out = require('./log');
  }
  catch (e) {
    out = console;
  }

  this.log = function (o) {
    out.log(o);
  };
})();

/**
  @name file
  @namespace file
*/

var fileUtils = new (function () {
  var _copyFile
    , _copyDir
    , _readDir
    , _rmDir
    , _watch;


  // Recursively copy files and directories
  _copyFile = function (fromPath, toPath, opts) {
    var from = path.normalize(fromPath)
      , to = path.normalize(toPath)
      , options = opts || {}
      , fromStat
      , toStat
      , destExists
      , destDoesNotExistErr
      , content
      , filename
      , dirContents
      , targetDir;

    fromStat = fs.statSync(from);

    try {
      //console.dir(to + ' destExists');
      toStat = fs.statSync(to);
      destExists = true;
    }
    catch(e) {
      //console.dir(to + ' does not exist');
      destDoesNotExistErr = e;
      destExists = false;
    }
    // Destination dir or file exists, copy into (directory)
    // or overwrite (file)
    if (destExists) {

      // If there's a rename-via-copy file/dir name passed, use it.
      // Otherwise use the actual file/dir name
      filename = options.rename || path.basename(from);

      // Copying a directory
      if (fromStat.isDirectory()) {
        dirContents = fs.readdirSync(from);
        targetDir = path.join(to, filename);
        // We don't care if the target dir already exists
        try {
          fs.mkdirSync(targetDir, options.mode || 0755);
        }
        catch(e) {
          if (e.code != 'EEXIST') {
            throw e;
          }
        }
        for (var i = 0, ii = dirContents.length; i < ii; i++) {
          //console.log(dirContents[i]);
          _copyFile(path.join(from, dirContents[i]), targetDir);
        }
      }
      // Copying a file
      else {
        content = fs.readFileSync(from);
        // Copy into dir
        if (toStat.isDirectory()) {
          //console.log('copy into dir ' + to);
          fs.writeFileSync(path.join(to, filename), content);
        }
        // Overwrite file
        else {
          //console.log('overwriting ' + to);
          fs.writeFileSync(to, content);
        }
      }
    }
    // Dest doesn't exist, can't create it
    else {
      throw destDoesNotExistErr;
    }
  };

  _copyDir = function (from, to, opts) {
    var createDir = opts.createDir;
  };

  // Return the contents of a given directory
  _readDir = function (dirPath) {
    var dir = path.normalize(dirPath)
      , paths = []
      , ret = [dir]
      , msg;

    try {
      paths = fs.readdirSync(dir);
    }
    catch (e) {
      msg = 'Could not read path ' + dir + '\n';
      if (e.stack) {
        msg += e.stack;
      }
      throw new Error(msg);
    }

    paths.forEach(function (p) {
      var curr = path.join(dir, p);
      var stat = fs.statSync(curr);
      if (stat.isDirectory()) {
        ret = ret.concat(_readDir(curr));
      }
      else {
        ret.push(curr);
      }
    });

    return ret;
  };

  // Remove the given directory
  _rmDir = function (dirPath) {
    var dir = path.normalize(dirPath)
      , paths = [];
    paths = fs.readdirSync(dir);
    paths.forEach(function (p) {
      var curr = path.join(dir, p);
      var stat = fs.statSync(curr);
      if (stat.isDirectory()) {
        _rmDir(curr);
      }
      else {
        try {
          fs.unlinkSync(curr);
        } catch(e) {
          if (e.code === 'EPERM') {
            fs.chmodSync(curr, '0666');
            fs.unlinkSync(curr);
          } else {
            throw e;
          }
        }
      }
    });
    fs.rmdirSync(dir);
  };

  // Recursively watch files with a callback
  _watch = function () {
    var args = Array.prototype.slice.call(arguments)
      , filePath
      , opts
      , callback
      , inclPat
      , exclPat
      , createWatcher;

    filePath = args.shift();
    callback = args.pop();
    opts = args.pop() || {};
    inclPat = opts.includePattern || DEFAULT_INCLUDE_PAT;
    exclPat = opts.excludePattern || DEFAULT_EXCLUDE_PAT;

    opts.level = opts.level || 1;

    createWatcher = function (watchPath) {
      if (!exclPat.test(watchPath)) {
        fs.watch(watchPath, function (ev, p) {
          if (inclPat.test(p) && !exclPat.test(p)) {
            callback(path.join(watchPath, p));
          }
        });
      }
    };

    fs.stat(filePath, function (err, stats) {
      if (err) {
        return false;
      }
      // Watch files at the top level
      if (stats.isFile() && opts.level == 1) {
        createWatcher(filePath);
        opts.level++;
      }
      else if (stats.isDirectory()) {
        createWatcher(filePath);
        opts.level++;
        fs.readdir(filePath, function (err, files) {
          if (err) {
            return log.fatal(err);
          }
          for (var f in files) {
            _watch(path.join(filePath, files[f]), opts, callback);
          }
        });
      }
    });
  };

  /**
    @name file#cpR
    @public
    @function
    @description Copies a directory/file to a destination
    @param {String} fromPath The source path to copy from
    @param {String} toPath The destination path to copy to
    @param {Object} opts Options to use
      @param {Boolean} [opts.silent] If false then will log the command
  */
  this.cpR = function (fromPath, toPath, options) {
    var from = path.normalize(fromPath)
      , to = path.normalize(toPath)
      , toStat
      , doesNotExistErr
      , paths
      , filename
      , opts = options || {};

    if (!opts.silent) {
      logger.log('cp -r ' + fromPath + ' ' + toPath);
    }

    if (from == to) {
      throw new Error('Cannot copy ' + from + ' to itself.');
    }

    // Handle rename-via-copy
    try {
      toStat = fs.statSync(to);
    }
    catch(e) {
      doesNotExistErr = e;

      // Get abs path so it's possible to check parent dir
      if (!this.isAbsolute(to)) {
        to = path.join(process.cwd() , to);
      }

      // Save the file/dir name
      filename = path.basename(to);
      // See if a parent dir exists, so there's a place to put the
      /// renamed file/dir (resets the destination for the copy)
      to = path.dirname(to);
      try {
        toStat = fs.statSync(to);
      }
      catch(e) {}
      if (toStat && toStat.isDirectory()) {
        // Set the rename opt to pass to the copy func, will be used
        // as the new file/dir name
        opts.rename = filename;
        //console.log('filename ' + filename);
      }
      else {
        throw doesNotExistErr;
      }
    }

    _copyFile(from, to, opts);
  };

  /**
    @name file#mkdirP
    @public
    @function
    @description Create the given directory(ies) using the given mode permissions
    @param {String} dir The directory to create
    @param {Number} mode The mode to give the created directory(ies)(Default: 0755)
  */
  this.mkdirP = function (dir, mode) {
    var dirPath = path.normalize(dir)
      , paths = dirPath.split(/\/|\\/)
      , currPath = ''
      , next;

    if (paths[0] == '' || /^[A-Za-z]+:/.test(paths[0])) {
      currPath = paths.shift() || '/';
      currPath = path.join(currPath, paths.shift());
      //console.log('basedir');
    }
    while ((next = paths.shift())) {
      if (next == '..') {
        currPath = path.join(currPath, next);
        continue;
      }
      currPath = path.join(currPath, next);
      try {
        //console.log('making ' + currPath);
        fs.mkdirSync(currPath, mode || 0755);
      }
      catch(e) {
        if (e.code != 'EEXIST') {
          throw e;
        }
      }
    }
  };

  /**
    @name file#readdirR
    @public
    @function
    @return {Array} Returns the contents as an Array, can be configured via opts.format
    @description Reads the given directory returning it's contents
    @param {String} dir The directory to read
    @param {Object} opts Options to use
      @param {String} [opts.format] Set the format to return(Default: Array)
  */
  this.readdirR = function (dir, opts) {
    var options = opts || {}
      , format = options.format || 'array'
      , ret;
    ret = _readDir(dir);
    return format == 'string' ? ret.join('\n') : ret;
  };

  /**
    @name file#rmRf
    @public
    @function
    @description Deletes the given directory/file
    @param {String} p The path to delete, can be a directory or file
    @param {Object} opts Options to use
      @param {String} [opts.silent] If false then logs the command
  */
  this.rmRf = function (p, options) {
    var stat
      , opts = options || {};
    if (!opts.silent) {
      logger.log('rm -rf ' + p);
    }
    try {
      stat = fs.statSync(p);
      if (stat.isDirectory()) {
        _rmDir(p);
      }
      else {
        fs.unlinkSync(p);
      }
    }
    catch (e) {}
  };

  /**
    @name file#isAbsolute
    @public
    @function
    @return {Boolean/String} If it's absolute the first character is returned otherwise false
    @description Checks if a given path is absolute or relative
    @param {String} p Path to check
  */
  this.isAbsolute = function (p) {
    var match = /^[A-Za-z]+:\\|^\//.exec(p);
    if (match && match.length) {
      return match[0];
    }
    return false;
  };

  /**
    @name file#absolutize
    @public
    @function
    @return {String} Returns the absolute path for the given path
    @description Returns the absolute path for the given path
    @param {String} p The path to get the absolute path for
  */
  this.absolutize = function (p) {
    if (this.isAbsolute(p)) {
      return p;
    }
    else {
      return path.join(process.cwd(), p);
    }
  };

  /**
    Given a patern, return the base directory of it (ie. the folder
    that will contain all the files matching the path).
    eg. file.basedir('/test/**') => '/test/'
    Path ending by '/' are considerd as folder while other are considerd
    as files, eg.:
        file.basedir('/test/a/') => '/test/a'
        file.basedir('/test/a') => '/test'
    The returned path always end with a '/' so we have:
        file.basedir(file.basedir(x)) == file.basedir(x)
  */
  this.basedir = function (pathParam) {
    var basedir = ''
      , parts
      , part
      , pos = 0
      , p = pathParam || '';

    // If the path has a leading asterisk, basedir is the current dir
    if (p.indexOf('*') == 0 || p.indexOf('**') == 0) {
      return '.';
    }

    // always consider .. at the end as a folder and not a filename
    if (/(?:^|\/|\\)\.\.$/.test(p.slice(-3))) {
      p += '/';
    }

    parts = p.split(/\\|\//);
    for (var i = 0, l = parts.length - 1; i < l; i++) {
      part = parts[i];
      if (part.indexOf('*') > -1 || part.indexOf('**') > -1) {
        break;
      }
      pos += part.length + 1;
      basedir += part + p[pos - 1];
    }
    if (!basedir) {
      basedir = '.';
    }
    // Strip trailing slashes
    if (!(basedir == '\\' || basedir == '/')) {
      basedir = basedir.replace(/\\$|\/$/, '');
    }
    return basedir;

  };

  /**
    @name file#searchParentPath
    @public
    @function
    @description Search for a directory/file in the current directory and parent directories
    @param {String} p The path to search for
    @param {Function} callback The function to call once the path is found
  */
  this.searchParentPath = function (location, beginPath, callback) {
    if (typeof beginPath === 'function' && !callback) {
      callback = beginPath;
      beginPath = process.cwd();
    }
    var cwd = beginPath || process.cwd();

    if (!location) {
      // Return if no path is given
      return;
    }
    var relPath = ''
      , i = 5 // Only search up to 5 directories
      , pathLoc
      , pathExists;

    while (--i >= 0) {
      pathLoc = path.join(cwd, relPath, location);
      pathExists = this.existsSync(pathLoc);

      if (pathExists) {
        callback && callback(undefined, pathLoc);
        break;
      } else {
        // Dir could not be found
        if (i === 0) {
          callback && callback(new Error("Path \"" + pathLoc + "\" not found"), undefined);
          break;
        }

        // Add a relative parent directory
        relPath += '../';
        // Switch to relative parent directory
        process.chdir(path.join(cwd, relPath));
      }
    }
  };

  /**
    @name file#watch
    @public
    @function
    @description Watch a given path then calls the callback once a change occurs
    @param {String} path The path to watch
    @param {Function} callback The function to call when a change occurs
  */
  this.watch = function () {
    _watch.apply(this, arguments);
  };

  // Compatibility for fs.exists(0.8) and path.exists(0.6)
  this.exists = (typeof fs.exists === 'function') ? fs.exists : path.exists;

  // Compatibility for fs.existsSync(0.8) and path.existsSync(0.6)
  this.existsSync = (typeof fs.existsSync === 'function') ? fs.existsSync : path.existsSync;

  /**
    @name file#requireLocal
    @public
    @function
    @return {Object} The given module is returned
    @description Require a local module from the node_modules in the current directory
    @param {String} module The module to require
    @param {String} message An option message to throw if the module doesn't exist
  */
  this.requireLocal = function (module, message) {
    // Try to require in the application directory
    try {
      dep = require(path.join(process.cwd(), 'node_modules', module));
    }
    catch(err) {
      if (message) {
        throw new Error(message);
      }
      throw new Error('Module "' + module + '" could not be found as a ' +
          'local module. Please install it by doing "npm install ' +
          module + '"');
    }
    return dep;
  };

})();

module.exports = fileUtils;


}).call(this,require("lppjwH"))
},{"./log":27,"fs":36,"lppjwH":48,"path":47}],24:[function(require,module,exports){
/*
 * Utilities: A classic collection of JavaScript utilities
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/
var core = require('./core')
  , i18n;

var DEFAULT_LOCALE = 'en-us';

i18n = new (function () {
  var _defaultLocale = DEFAULT_LOCALE
    , _strings = {};

  this.getText = function (key, opts, locale) {
    var currentLocale = locale || _defaultLocale
      , currentLocaleStrings = _strings[currentLocale] || {}
      , defaultLocaleStrings = _strings[_defaultLocale] || {}
      , str = currentLocaleStrings[key]
            || defaultLocaleStrings[key] || "[[" + key + "]]";
    for (p in opts) {
      str = str.replace(new RegExp('\\{' + p + '\\}', 'g'), opts[p]);
    }
    return str;
  };

  this.getDefaultLocale = function () {
    return _defaultLocale;
  };

  this.setDefaultLocale = function (locale) {
    _defaultLocale = locale;
  };

  this.loadLocale = function (locale, strings) {
    _strings[locale] = _strings[locale] || {};
    core.mixin(_strings[locale], strings);
  };

})();

i18n.I18n = function (locale) {
  var _locale = locale || i18n.getDefaultLocale();

  this.getLocale = function (locale) {
    return _locale;
  };

  this.setLocale = function (locale) {
    _locale = locale;
  };

  this.getText = function (key, opts, locale) {
    return i18n.getText(key,
        opts || {}, locale || _locale);
  };
  this.t = this.getText;
};

module.exports = i18n;


},{"./core":20}],25:[function(require,module,exports){
/*
 * Utilities: A classic collection of JavaScript utilities
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/
var utils = {}
// Core methods
  , core = require('./core')
// Namespaces with methods
  , string = require('./string')
  , file = require('./file')
  , async = require('./async')
  , i18n = require('./i18n')
  , uri = require('./uri')
  , array = require('./array')
  , object = require('./object')
  , date = require('./date')
  , request = require('./request')
  , log = require('./log')
  , network = require('./network')
// Third-party -- remove this if possible
  , inflection = require('./inflection')
// Constructors
  , EventBuffer = require('./event_buffer').EventBuffer
  , XML = require('./xml').XML
  , SortedCollection = require('./sorted_collection').SortedCollection;

core.mixin(utils, core);

utils.string = string;
utils.file = file;
utils.async = async;
utils.i18n = i18n;
utils.uri = uri;
utils.array = array;
utils.object = object;
utils.date = date;
utils.request = request;
utils.log = log;
utils.network = network;
utils.inflection = inflection;
utils.SortedCollection = SortedCollection;
utils.EventBuffer = EventBuffer;
utils.XML = XML;

module.exports = utils;


},{"./array":18,"./async":19,"./core":20,"./date":21,"./event_buffer":22,"./file":23,"./i18n":24,"./inflection":26,"./log":27,"./network":28,"./object":29,"./request":30,"./sorted_collection":31,"./string":32,"./uri":33,"./xml":34}],26:[function(require,module,exports){
/*
 * Copyright (c) 2010 George Moschovitis, http://www.gmosx.com
 *
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
 * CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * A port of the Rails/ActiveSupport Inflector class
 * http://api.rubyonrails.org/classes/ActiveSupport/Inflector.html
*/

/**
  @name inflection
  @namespace inflection
*/

var inflection = new (function () {

  /**
    @name inflection#inflections
    @public
    @object
    @description A list of rules and replacements for different inflection types
  */
  this.inflections = {
      plurals: []
    , singulars: []
    , uncountables: []
  };

  var self = this
    , setInflection
    , setPlural
    , setSingular
    , setUncountable
    , setIrregular;

  // Add a new inflection rule/replacement to the beginning of the array for the
  // inflection type
  setInflection = function (type, rule, replacement) {
    self.inflections[type].unshift([rule, replacement]);
  };

  // Add a new plural inflection rule
  setPlural = function (rule, replacement) {
    setInflection('plurals', rule, replacement);
  };

  // Add a new singular inflection rule
  setSingular = function (rule, replacement) {
    setInflection('singulars', rule, replacement);
  };

  // Add a new irregular word to the inflection list, by a given singular and plural inflection
  setIrregular = function (singular, plural) {
    if (singular.substr(0, 1).toUpperCase() == plural.substr(0, 1).toUpperCase()) {
      setPlural(new RegExp("(" + singular.substr(0, 1) + ")" + singular.substr(1) + "$", "i"),
        '$1' + plural.substr(1));
      setPlural(new RegExp("(" + plural.substr(0, 1) + ")" + plural.substr(1) + "$", "i"),
        '$1' + plural.substr(1));
      setSingular(new RegExp("(" + plural.substr(0, 1) + ")" + plural.substr(1) + "$", "i"),
        '$1' + singular.substr(1));
    } else {
      setPlural(new RegExp(singular.substr(0, 1).toUpperCase() + singular.substr(1) + "$"),
        plural.substr(0, 1).toUpperCase() + plural.substr(1));
      setPlural(new RegExp(singular.substr(0, 1).toLowerCase() + singular.substr(1) + "$"),
        plural.substr(0, 1).toLowerCase() + plural.substr(1));
      setPlural(new RegExp(plural.substr(0, 1).toUpperCase() + plural.substr(1) + "$"),
        plural.substr(0, 1).toUpperCase() + plural.substr(1));
      setPlural(new RegExp(plural.substr(0, 1).toLowerCase() + plural.substr(1) + "$"),
        plural.substr(0, 1).toLowerCase() + plural.substr(1));
      setSingular(new RegExp(plural.substr(0, 1).toUpperCase() + plural.substr(1) + "$"),
        singular.substr(0, 1).toUpperCase() + singular.substr(1));
      setSingular(new RegExp(plural.substr(0, 1).toLowerCase() + plural.substr(1) + "$"),
        singular.substr(0, 1).toLowerCase() + singular.substr(1));
    }
  };

  // Add a new word to the uncountable inflection list
  setUncountable = function (word) {
    self.inflections.uncountables[word] = true;
  };

  // Create inflections
  (function () {
    setPlural(/$/, "s");
    setPlural(/s$/i, "s");
    setPlural(/(ax|test)is$/i, "$1es");
    setPlural(/(octop|vir)us$/i, "$1i");
    setPlural(/(alias|status)$/i, "$1es");
    setPlural(/(bu)s$/i, "$1ses");
    setPlural(/(buffal|tomat)o$/i, "$1oes");
    setPlural(/([ti])um$/i, "$1a");
    setPlural(/sis$/i, "ses");
    setPlural(/(?:([^f])fe|([lr])f)$/i, "$1$2ves");
    setPlural(/(hive)$/i, "$1s");
    setPlural(/([^aeiouy]|qu)y$/i, "$1ies");
    setPlural(/(x|ch|ss|sh)$/i, "$1es");
    setPlural(/(matr|vert|ind)(?:ix|ex)$/i, "$1ices");
    setPlural(/([m|l])ouse$/i, "$1ice");
    setPlural(/^(ox)$/i, "$1en");
    setPlural(/(quiz)$/i, "$1zes");

    setSingular(/s$/i, "")
		setSingular(/ss$/i, "ss")
    setSingular(/(n)ews$/i, "$1ews")
    setSingular(/([ti])a$/i, "$1um")
    setSingular(/((a)naly|(b)a|(d)iagno|(p)arenthe|(p)rogno|(s)ynop|(t)he)ses$/i, "$1$2sis")
    setSingular(/(^analy)ses$/i, "$1sis")
    setSingular(/([^f])ves$/i, "$1fe")
    setSingular(/(hive)s$/i, "$1")
    setSingular(/(tive)s$/i, "$1")
    setSingular(/([lr])ves$/i, "$1f")
    setSingular(/([^aeiouy]|qu)ies$/i, "$1y")
    setSingular(/(s)eries$/i, "$1eries")
    setSingular(/(m)ovies$/i, "$1ovie")
    setSingular(/(x|ch|ss|sh)es$/i, "$1")
    setSingular(/([m|l])ice$/i, "$1ouse")
    setSingular(/(bus)es$/i, "$1")
    setSingular(/(o)es$/i, "$1")
    setSingular(/(shoe)s$/i, "$1")
    setSingular(/(cris|ax|test)es$/i, "$1is")
    setSingular(/(octop|vir)i$/i, "$1us")
    setSingular(/(alias|status)es$/i, "$1")
    setSingular(/^(ox)en/i, "$1")
    setSingular(/(vert|ind)ices$/i, "$1ex")
    setSingular(/(matr)ices$/i, "$1ix")
    setSingular(/(quiz)zes$/i, "$1")
    setSingular(/(database)s$/i, "$1")

    setIrregular("person", "people");
    setIrregular("man", "men");
    setIrregular("child", "children");
    setIrregular("sex", "sexes");
    setIrregular("move", "moves");
    setIrregular("cow", "kine");

    setUncountable("equipment");
    setUncountable("information");
    setUncountable("rice");
    setUncountable("money");
    setUncountable("species");
    setUncountable("series");
    setUncountable("fish");
    setUncountable("sheep");
    setUncountable("jeans");
  })();

  /**
    @name inflection#parse
    @public
    @function
    @return {String} The inflection of the word from the type given
    @description Parse a word from the given inflection type
    @param {String} type A type of the inflection to use
    @param {String} word the word to parse
  */
  this.parse = function (type, word) {
    var lowWord = word.toLowerCase()
      , inflections = this.inflections[type];

    if (this.inflections.uncountables[lowWord]) {
      return word;
    }

    var i = -1;
    while (++i < inflections.length) {
      var rule = inflections[i][0]
        , replacement = inflections[i][1];

      if (rule.test(word)) {
        return word.replace(rule, replacement)
      }
    }

    return word;
  };

  /**
    @name inflection#pluralize
    @public
    @function
    @return {String} The plural inflection for the given word
    @description Create a plural inflection for a word
    @param {String} word the word to create a plural version for
  */
  this.pluralize = function (word) {
    return this.parse('plurals', word);
  };

  /**
    @name inflection#singularize
    @public
    @function
    @return {String} The singular inflection for the given word
    @description Create a singular inflection for a word
    @param {String} word the word to create a singular version for
  */
  this.singularize = function (word) {
    return this.parse('singulars', word);
  };

})();

module.exports = inflection;

},{}],27:[function(require,module,exports){
var util = require('util')
  , log
  , _logger
  , _levels
  , _serialize
  , _output;

_levels = {
  'debug': 'log'
, 'log' : 'log'
, 'info': 'info'
, 'notice': 'info'
, 'warning': 'warn'
, 'warn': 'warn'
, 'error': 'error'
, 'critical': 'error'
, 'alert': 'error'
, 'emergency': 'error'
};

_serialize = function (obj) {
  var out;
  if (typeof obj == 'string') {
    out = obj;
  }
  else {
    out = util.inspect(obj);
  }
  return out;
};

_output = function (obj, level) {
  var out = _serialize(obj);
  if (_logger) {
    _logger[level](out);
  }
  else {
    console[_levels[level]](out);
  }
};


log = function (obj) {
  _output(obj, 'info');
};

log.registerLogger = function (logger) {
  // Malkovitch, Malkovitch
  if (logger === log) {
    return;
  }
  _logger = logger;
};

(function () {
  var level;
  for (var p in _levels) {
    (function (p) {
      level = _levels[p];
      log[p] = function (obj) {
        _output(obj, p);
      };
    })(p);
  }
  // Also handle 'access', not an actual level
  log.access = log.info;
})();

module.exports = log;

},{"util":69}],28:[function(require,module,exports){
/*
 * Utilities: A classic collection of JavaScript utilities
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/

var network
	, net = require('net');

/**
  @name network
  @namespace network
*/

network = new (function () {
	/**
		@name network#isPortOpen
		@public
		@function
		@description Checks if the given port in the given host is open
		@param {Number} port number
		@param {String} host
		@param {Function} callback Callback function -- should be in the format
			of function(err, result) {}
	*/
	this.isPortOpen = function (port, host, callback) {
		if (typeof host === 'function' && !callback) {
			callback = host;
			host = 'localhost';
		}

		var isOpen = false
			, connection
			, error;

		connection = net.createConnection(port, host, function () {
			isOpen = true;
			connection.end();
		});

		connection.on('error', function (err) {
			// We ignore 'ECONNREFUSED' as it simply indicates the port isn't open.
			// Anything else is reported
			if(err.code !== 'ECONNREFUSED') {
				error = err;
			}
		});

		connection.setTimeout(400, function () {
			connection.end();
		});

		connection.on('close', function () {
			callback && callback(error, isOpen);
		});
	};

})();

module.exports = network;
},{"net":36}],29:[function(require,module,exports){
/*
 * Utilities: A classic collection of JavaScript utilities
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/

/**
  @name object
  @namespace object
*/

var object = new (function () {

  /**
    @name object#merge
    @public
    @function
    @return {Object} Returns the merged object
    @description Merge merges `otherObject` into `object` and takes care of deep
                 merging of objects
    @param {Object} object Object to merge into
    @param {Object} otherObject Object to read from
  */
  this.merge = function (object, otherObject) {
    var obj = object || {}
      , otherObj = otherObject || {}
      , key, value;

    for (key in otherObj) {
      value = otherObj[key];

      // Check if a value is an Object, if so recursively add it's key/values
      if (typeof value === 'object' && !(value instanceof Array)) {
        // Update value of object to the one from otherObj
        obj[key] = this.merge(obj[key], value);
      }
      // Value is anything other than an Object, so just add it
      else {
        obj[key] = value;
      }
    }

    return obj;
  };

  /**
    @name object#reverseMerge
    @public
    @function
    @return {Object} Returns the merged object
    @description ReverseMerge merges `object` into `defaultObject`
    @param {Object} object Object to read from
    @param {Object} defaultObject Object to merge into
  */
  this.reverseMerge = function (object, defaultObject) {
    // Same as `merge` except `defaultObject` is the object being changed
    // - this is useful if we want to easily deal with default object values
    return this.merge(defaultObject, object);
  };

  /**
    @name object#isEmpty
    @public
    @function
    @return {Boolean} Returns true if empty false otherwise
    @description isEmpty checks if an Object is empty
    @param {Object} object Object to check if empty
  */
  this.isEmpty = function (object) {
    // Returns true if a object is empty false if not
    for (var i in object) { return false; }
    return true;
  };

  /**
    @name object#toArray
    @public
    @function
    @return {Array} Returns an array of objects each including the original key and value
    @description Converts an object to an array of objects each including the original key/value
    @param {Object} object Object to convert
  */
  this.toArray = function (object) {
    // Converts an object into an array of objects with the original key, values
    array = [];

    for (var i in object) {
      array.push({ key: i, value: object[i] });
    }

    return array;
  };

})();

module.exports = object;

},{}],30:[function(require,module,exports){
/*
 * Utilities: A classic collection of JavaScript utilities
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/
var http = require('http')
  , https = require('https')
  , url = require('url')
  , uri = require('./uri')
  , log = require('./log')
  , core = require('./core');

var formatters = {
  xml: function (data) {
    return data;
  }
, html: function (data) {
    return data;
  }
, txt: function (data) {
    return data;
  }
, json: function (data) {
    return JSON.parse(data);
  }
}

/**
  @name request
  @namespace request
  @public
  @function
  @description Sends requests to the given url sending any data if the method is POST or PUT
  @param {Object} opts The options to use for the request
    @param {String} [opts.url] The URL to send the request to
    @param {String} [opts.method=GET] The method to use for the request
    @param {Object} [opts.headers] Headers to send on requests
    @param {String} [opts.data] Data to send on POST and PUT requests
    @param {String} [opts.dataType] The type of data to send
  @param {Function} callback the function to call after, args are `error, data`
*/
var request = function (opts, callback) {
  var client
    , options = opts || {}
    , parsed = url.parse(options.url)
    , path
    , requester = parsed.protocol == 'http:' ? http : https
    , method = (options.method && options.method.toUpperCase()) || 'GET'
    , headers = core.mixin({}, options.headers || {})
    , contentLength
    , port
    , clientOpts;

  if (parsed.port) {
    port = parsed.port;
  }
  else {
    port = parsed.protocol == 'http:' ? '80' : '443';
  }

  path = parsed.pathname;
  if (parsed.search) {
    path += parsed.search;
  }

  if (method == 'POST' || method == 'PUT') {
    if (options.data) {
      contentLength = options.data.length;
    }
    else {
      contentLength = 0
    }
    headers['Content-Length'] = contentLength;
  }

  clientOpts = {
    host: parsed.hostname
  , port: port
  , method: method
  , agent: false
  , path: path
  , headers: headers
  };
  client = requester.request(clientOpts);

  client.addListener('response', function (resp) {
    var data = ''
      , dataType;
    resp.addListener('data', function (chunk) {
      data += chunk.toString();
    });
    resp.addListener('end', function () {
      var stat = resp.statusCode
        , err;
      // Successful response
      if ((stat > 199 && stat < 300) || stat == 304) {
        dataType = options.dataType || uri.getFileExtension(parsed.pathname);
        if (formatters[dataType]) {
          try {
            if (data) {
              data = formatters[dataType](data);
            }
          }
          catch (e) {
            callback(e, null);
          }
        }
        callback(null, data);
      }
      // Something failed
      else {
        err = new Error(data);
        err.statusCode = resp.statusCode;
        callback(err, null);
      }

    });
  });

  client.addListener('error', function (e) {
    callback(e, null);
  });

  if ((method == 'POST' || method == 'PUT') && options.data) {
    client.write(options.data);
  }

  client.end();
};

module.exports = request;

},{"./core":20,"./log":27,"./uri":33,"http":41,"https":45,"url":67}],31:[function(require,module,exports){
/*
 * Utilities: A classic collection of JavaScript utilities
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/

/**
  @name SortedCollection
  @namespace SortedCollection
  @constructor
*/

var SortedCollection = function (d) {
  this.count = 0;
  this.items = {}; // Hash keys and their values
  this.order = []; // Array for sort order
  if (d) {
    this.defaultValue = d;
  };
};

SortedCollection.prototype = new (function () {
  /**
    @name SortedCollection#addItem
    @public
    @function
    @return {Any} The given val is returned
    @description Adds a new key/value to the collection
    @param {String} key The key for the collection item
    @param {Any} val The value for the collection item
  */
  this.addItem = function (key, val) {
    if (typeof key != 'string') {
      throw('Hash only allows string keys.');
    }
    return this.setByKey(key, val);
  };

  /**
    @name SortedCollection#getItem
    @public
    @function
    @return {Any} The value for the given identifier is returned
    @description Retrieves the value for the given identifier that being a key or index
    @param {String/Number} p The identifier to look in the collection for, being a key or index
  */
  this.getItem = function (p) {
    if (typeof p == 'string') {
      return this.getByKey(p);
    }
    else if (typeof p == 'number') {
      return this.getByIndex(p);
    }
  };

  /**
    @name SortedCollection#setItem
    @public
    @function
    @return {Any} The given val is returned
    @description Sets the item in the collection with the given val, overwriting the existsing item
      if identifier is an index
    @param {String/Number} p The identifier set in the collection, being either a key or index
    @param {Any} val The value for the collection item
  */
  this.setItem = function (p, val) {
    if (typeof p == 'string') {
      return this.setByKey(p, val);
    }
    else if (typeof p == 'number') {
      return this.setByIndex(p, val);
    }
  };

  /**
    @name SortedCollection#removeItem
    @public
    @function
    @return {Boolean} Returns true if the item has been removed, false otherwise
    @description Removes the item for the given identifier
    @param {String/Number} p The identifier to delete the item for, being a key or index
  */
  this.removeItem = function (p) {
    if (typeof p == 'string') {
      return this.removeByKey(p);
    }
    else if (typeof p == 'number') {
      return this.removeByIndex(p);
    }
  };

  /**
    @name SortedCollection#getByKey
    @public
    @function
    @return {Any} The value for the given key item is returned
    @description Retrieves the value for the given key
    @param {String} key The key for the item to lookup
  */
  this.getByKey = function (key) {
    return this.items[key];
  };

  /**
    @name SortedCollection#setByKey
    @public
    @function
    @return {Any} The given val is returned
    @description Sets a item by key assigning the given val
    @param {String} key The key for the item
    @param {Any} val The value to set for the item
  */
  this.setByKey = function (key, val) {
    var v = null;
    if (typeof val == 'undefined') {
      v = this.defaultValue;
    }
    else { v = val; }
    if (typeof this.items[key] == 'undefined') {
      this.order[this.count] = key;
      this.count++;
    }
    this.items[key] = v;
    return this.items[key];
  };

  /**
    @name SortedCollection#removeByKey
    @public
    @function
    @return {Boolean} If the item was removed true is returned, false otherwise
    @description Removes a collection item by key
    @param {String} key The key for the item to remove
  */
  this.removeByKey = function (key) {
    if (typeof this.items[key] != 'undefined') {
      var pos = null;
      delete this.items[key]; // Remove the value
      // Find the key in the order list
      for (var i = 0; i < this.order.length; i++) {
        if (this.order[i] == key) {
          pos = i;
        }
      }
      this.order.splice(pos, 1); // Remove the key
      this.count--; // Decrement the length
      return true;
    }
    else {
      return false;
    }
  };

  /**
    @name SortedCollection#getByIndex
    @public
    @function
    @return {Any} The value for the given index item is returned
    @description Retrieves the value for the given index
    @param {Number} ind The index to lookup for the item
  */
  this.getByIndex = function (ind) {
    return this.items[this.order[ind]];
  };

  /**
    @name SortedCollection#setByIndex
    @public
    @function
    @return {Any} The given val is returned
    @description Sets a item by index assigning the given val
    @param {Number} ind The index for the item
    @param {Any} val The value to set for the item
  */
  this.setByIndex = function (ind, val) {
    if (ind < 0 || ind >= this.count) {
      throw('Index out of bounds. Hash length is ' + this.count);
    }
    this.items[this.order[ind]] = val;
    return this.items[this.order[ind]];
  };

  /**
    @name SortedCollection#removeByIndex
    @public
    @function
    @return {Boolean} If the item was removed true is returned, false otherwise
    @description Removes a collection item by index
    @param {Number} ind The index for the item to remove
  */
  this.removeByIndex = function (ind) {
    var ret = this.items[this.order[ind]];
    if (typeof ret != 'undefined') {
      delete this.items[this.order[ind]]
      this.order.splice(ind, 1);
      this.count--;
      return true;
    }
    else {
      return false;
    }
  };

  /**
    @name SortedCollection#hasKey
    @public
    @function
    @return {Boolean} Returns true if the item exists, false otherwise
    @description Checks if a key item exists in the collection
    @param {String} key The key to look for in the collection
  */
  this.hasKey = function (key) {
    return typeof this.items[key] != 'undefined';
  };

  /**
    @name SortedCollection#hasValue
    @public
    @function
    @return {Boolean} Returns true if a key with the given value exists, false otherwise
    @description Checks if a key item in the collection has a given val
    @param {Any} val The value to check for in the collection
  */
  this.hasValue = function (val) {
    for (var i = 0; i < this.order.length; i++) {
      if (this.items[this.order[i]] == val) {
        return true;
      }
    }
    return false;
  };

  /**
    @name SortedCollection#allKeys
    @public
    @function
    @return {String} Returns all the keys in a string
    @description Joins all the keys into a string
    @param {String} str The string to use between each key
  */
  this.allKeys = function (str) {
    return this.order.join(str);
  };

  /**
    @name SortedCollection#replaceKey
    @public
    @function
    @description Joins all the keys into a string
    @param {String} oldKey The key item to change
    @param {String} newKey The key item to change the name to
  */
  this.replaceKey = function (oldKey, newKey) {
    // If item for newKey exists, nuke it
    if (this.hasKey(newKey)) {
      this.removeItem(newKey);
    }
    this.items[newKey] = this.items[oldKey];
    delete this.items[oldKey];
    for (var i = 0; i < this.order.length; i++) {
      if (this.order[i] == oldKey) {
        this.order[i] = newKey;
      }
    }
  };

  /**
    @name SortedCollection#insertAtIndex
    @public
    @function
    @return {Boolean} Returns true if the item was set at the given index
    @description Inserts a key/value at a specific index in the collection
    @param {Number} ind The index to set the item at
    @param {String} key The key to use at the item index
    @param {Any} val The value to set for the item
  */
  this.insertAtIndex = function (ind, key, val) {
    this.order.splice(ind, 0, key);
    this.items[key] = val;
    this.count++;
    return true;
  };

  /**
    @name SortedCollection#insertAfterKey
    @public
    @function
    @return {Boolean} Returns true if the item was set for the given key
    @description Inserts a key/value item after the given reference key in the collection
    @param {String} refKey The key to insert the new item after
    @param {String} key The key for the new item
    @param {Any} val The value to set for the item
  */
  this.insertAfterKey = function (refKey, key, val) {
    var pos = this.getPosition(refKey);
    return this.insertAtIndex(pos, key, val);
  };

  /**
    @name SortedCollection#getPosition
    @public
    @function
    @return {Number} Returns the index for the item of the given key
    @description Retrieves the index of the key item
    @param {String} key The key to get the index for
  */
  this.getPosition = function (key) {
    var order = this.order;
    if (typeof order.indexOf == 'function') {
      return order.indexOf(key);
    }
    else {
      for (var i = 0; i < order.length; i++) {
        if (order[i] == key) { return i;}
      }
    }
  };

  /**
    @name SortedCollection#each
    @public
    @function
    @return {Boolean}
    @description Loops through the collection and calls the given function
    @param {Function} func The function to call for each collection item, the arguments
      are the key and value for the current item
    @param {Object} opts The options to use
      @param {Boolean} [opts.keyOnly] Only give the function the key
      @param {Boolean} [opts.valueOnly] Only give the function the value
  */
  this.each = function (func, opts) {
    var options = opts || {}
      , order = this.order;
    for (var i = 0, ii = order.length; i < ii; i++) {
      var key = order[i];
      var val = this.items[key];
      if (options.keyOnly) {
        func(key);
      }
      else if (options.valueOnly) {
        func(val);
      }
      else {
        func(val, key);
      }
    }
    return true;
  };

  /**
    @name SortedCollection#eachKey
    @public
    @function
    @return {Boolean}
    @description Loops through the collection and calls the given function
    @param {Function} func The function to call for each collection item, only giving the
      key to the function
  */
  this.eachKey = function (func) {
    return this.each(func, { keyOnly: true });
  };

  /**
    @name SortedCollection#eachValue
    @public
    @function
    @return {Boolean}
    @description Loops through the collection and calls the given function
    @param {Function} func The function to call for each collection item, only giving the
      value to the function
  */
  this.eachValue = function (func) {
    return this.each(func, { valueOnly: true });
  };

  /**
    @name SortedCollection#clone
    @public
    @function
    @return {Object} Returns a new SortedCollection with the data of the current one
    @description Creates a cloned version of the current collection and returns it
  */
  this.clone = function () {
    var coll = new SortedCollection()
      , key
      , val;
    for (var i = 0; i < this.order.length; i++) {
      key = this.order[i];
      val = this.items[key];
      coll.setItem(key, val);
    }
    return coll;
  };

  /**
    @name SortedCollection#concat
    @public
    @function
    @description Join a given collection with the current one
    @param {Object} hNew A SortedCollection to join from
  */
  this.concat = function (hNew) {
    for (var i = 0; i < hNew.order.length; i++) {
      var key = hNew.order[i];
      var val = hNew.items[key];
      this.setItem(key, val);
    }
  };

  /**
    @name SortedCollection#push
    @public
    @function
    @return {Number} Returns the count of items
    @description Appends a new item to the collection
    @param {String} key The key to use for the item
    @param {Any} val The value to use for the item
  */
  this.push = function (key, val) {
    this.insertAtIndex(this.count, key, val);
    return this.count;
  };

  /**
    @name SortedCollection#pop
    @public
    @function
    @return {Any} Returns the value for the last item in the collection
    @description Pops off the last item in the collection and returns it's value
  */
  this.pop = function () {
    var pos = this.count-1;
    var ret = this.items[this.order[pos]];
    if (typeof ret != 'undefined') {
      this.removeByIndex(pos);
      return ret;
    }
    else {
      return;
    }
  };

  /**
    @name SortedCollection#unshift
    @public
    @function
    @return {Number} Returns the count of items
    @description Prepends a new item to the beginning of the collection
    @param {String} key The key to use for the item
    @param {Any} val The value to use for the item
  */
  this.unshift = function (key, val) {
    this.insertAtIndex(0, key, val);
    return this.count;
  };

  /**
    @name SortedCollection#shift
    @public
    @function
    @return {Number} Returns the removed items value
    @description Removes the first item in the list and returns it's value
  */
  this.shift = function () {
    var pos = 0;
    var ret = this.items[this.order[pos]];
    if (typeof ret != 'undefined') {
      this.removeByIndex(pos);
      return ret;
    }
    else {
      return;
    }
  };

  /**
    @name SortedCollection#splice
    @public
    @function
    @description Removes items from index to the given max and then adds the given
      collections items
    @param {Number} index The index to start at when removing items
    @param {Number} numToRemove The number of items to remove before adding the new items
    @param {Object} hash the collection of items to add
  */
  this.splice = function (index, numToRemove, hash) {
    var _this = this;
    // Removal
    if (numToRemove > 0) {
      // Items
      var limit = index + numToRemove;
      for (var i = index; i < limit; i++) {
        delete this.items[this.order[i]];
      }
      // Order
      this.order.splice(index, numToRemove);
    }
    // Adding
    if (hash) {
      // Items
      for (var i in hash.items) {
        this.items[i] = hash.items[i];
      }
      // Order
      var args = hash.order;
      args.unshift(0);
      args.unshift(index);
      this.order.splice.apply(this.order, args);
    }
    this.count = this.order.length;
  };

  this.sort = function (c) {
    var arr = [];
    // Assumes vals are comparable scalars
    var comp = function (a, b) {
      return c(a.val, b.val);
    }
    for (var i = 0; i < this.order.length; i++) {
      var key = this.order[i];
      arr[i] = { key: key, val: this.items[key] };
    }
    arr.sort(comp);
    this.order = [];
    for (var i = 0; i < arr.length; i++) {
      this.order.push(arr[i].key);
    }
  };

  this.sortByKey = function (comp) {
    this.order.sort(comp);
  };

  /**
    @name SortedCollection#reverse
    @public
    @function
    @description Reverse the collection item list
  */
  this.reverse = function () {
    this.order.reverse();
  };

})();

module.exports.SortedCollection = SortedCollection;

},{}],32:[function(require,module,exports){
/*
 * Utilities: A classic collection of JavaScript utilities
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/
var core = require('./core')
  , inflection = require('./inflection')
  , string;


/**
  @name string
  @namespace string
*/

string = new (function () {

  // Regexes for trimming, and character maps for escaping
  var _LTR = /^\s+/
    , _RTR = /\s+$/
    , _TR = /^\s+|\s+$/g
    , _NL = /\n|\r|\r\n/g
    , _CHARS = {
          '&': '&amp;'
        , '<': '&lt;'
        , '>': '&gt;'
        , '"': '&quot;'
        , '\'': '&#39;'
      }
    , _UUID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')
    , _buildEscape
    , _buildEscapeTest;

  // Builds the escape/unescape methods using a
  // map of characters
  _buildEscape = function (direction) {
    return function (str) {
      var string = str;

      // If string is NaN, null or undefined then provide an empty default
      if((typeof string === 'undefined') ||
          string === null ||
          (!string && isNaN(string))) {
        string = '';
      }
      string = string.toString();

      var from, to, p;
      for (p in _CHARS) {
        from = direction == 'to' ? p : _CHARS[p];
        to = direction == 'to' ? _CHARS[p] : p;

        string = string.replace(new RegExp(from, 'gm'), to);
      }

      return string;
    }
  };

  // Builds a method that tests for any escapable
  // characters, useful for avoiding double-scaping if
  // you're not sure if a string has already been escaped
  _buildEscapeTest = function (direction) {
    return function (string) {
      var pat = ''
        , p;

      for (p in _CHARS) {
        pat += direction == 'to' ? p : _CHARS[p];
        pat += '|';
      }

      pat = pat.substr(0, pat.length - 1);
      pat = new RegExp(pat, "gm");
      return pat.test(string)
    }
  };

  // Escape special XMl chars
  this.escapeXML = _buildEscape('to');

  // Unescape XML chars to literal representation
  this.unescapeXML = _buildEscape('from');

  // Test if a string includes special chars
  // that need escaping
  this.needsEscape = _buildEscapeTest('to');

  // Test if a string includes escaped chars
  // that need unescaping
  this.needsUnescape = _buildEscapeTest('from');

  /**
    @name string#escapeRegExpChars
    @public
    @function
    @return {String} A string of escaped characters
    @description Escapes regex control-characters in strings
                 used to build regexes dynamically
    @param {String} string The string of chars to escape
  */
  this.escapeRegExpChars = (function () {
    var specials = [ '^', '$', '/', '.', '*', '+', '?', '|', '(', ')',
        '[', ']', '{', '}', '\\' ];
    sRE = new RegExp('(\\' + specials.join('|\\') + ')', 'g');
    return function (string) {
      var str = string || '';
      str = String(str);
      return str.replace(sRE, '\\$1');
    };
  }).call(this);

  /**
    @name string#toArray
    @public
    @function
    @return {Array} Returns an array of characters
    @description Converts a string to an array
    @param {String} string The string to convert
  */
  this.toArray = function (string) {
    var str = string || ''
      , arr = []
      , i = -1;
    str = String(str);

    while (++i < str.length) {
      arr.push(str.substr(i, 1));
    }

    return arr;
  };

  /**
    @name string#reverse
    @public
    @function
    @return {String} Returns the `string` reversed
    @description Reverses a string
    @param {String} string The string to reverse
  */
  this.reverse = function (string) {
    var str = string || '';
    str = String(str);
    return this.toArray(str).reverse().join('');
  };

  /**
    @name string#ltrim
    @public
    @function
    @return {String} Returns the trimmed string
    @description Ltrim trims `char` from the left of a `string` and returns it
                 if no `char` is given it will trim spaces
    @param {String} string The string to trim
    @param {String} character The character to trim
  */
  this.ltrim = function (string, character) {
    var str = string || ''
      , pat = character ? new RegExp('^' + character + '+') : _LTR;
    str = String(str);

    return str.replace(pat, '');
  };

  /**
    @name string#rtrim
    @public
    @function
    @return {String} Returns the trimmed string
    @description Rtrim trims `char` from the right of a `string` and returns it
                 if no `char` is given it will trim spaces
    @param {String} string The string to trim
    @param {String} character The character to trim
  */
  this.rtrim = function (string, character) {
    var str = string || ''
      , pat = character ? new RegExp(character + '+$') : _RTR;
    str = String(str);

    return str.replace(pat, '');
  };

  // Alias
  this.chomp = this.rtrim;

  /**
    @name string#trim
    @public
    @function
    @return {String} Returns the trimmed string
    @description Trim trims `char` from the left and right of a `string` and returns it
                 if no `char` is given it will trim spaces
    @param {String} string The string to trim
    @param {String} character The character to trim
  */
  this.trim = function (string, character) {
    var str = string || ''
      , pat = character ? new RegExp('^' + character + '+|' + character + '+$', 'g') : _TR;
    str = String(str);

    return str.replace(pat, '');
  };

  /**
    @name string#chop
    @public
    @function
    @description Returns a new String with the last character removed. If the
                 string ends with \r\n, both characters are removed. Applying chop to an
                 empty string returns an empty string.
    @param {String} string to return with the last character removed.
  */
  this.chop = function (string) {
    var index
      , str = string || '';
    str = String(str);

    if (str.length) {
      // Special-case for \r\n
      index = str.indexOf('\r\n');
      if (index == str.length - 2) {
        return str.substring(0, index);
      }
      return str.substring(0, str.length - 1);
    }
    else {
      return '';
    }
  };

  /**
    @name string#lpad
    @public
    @function
    @return {String} Returns the padded string
    @description Lpad adds `char` to the left of `string` until the length
                 of `string` is more than `width`
    @param {String} string The string to pad
    @param {String} character The character to pad with
    @param {Number} width the width to pad to
  */
  this.lpad = function (string, character, width) {
    var str = string || ''
      , width;
    str = String(str);

    // Should width be string.length + 1? or the same to be safe
    width = parseInt(width, 10) || str.length;
    character = character || ' ';

    while (str.length < width) {
      str = character + str;
    }
    return str;
  };

  /**
    @name string#rpad
    @public
    @function
    @return {String} Returns the padded string
    @description Rpad adds `char` to the right of `string` until the length
                 of `string` is more than `width`
    @param {String} string The string to pad
    @param {String} character The character to pad with
    @param {Number} width the width to pad to
  */
  this.rpad = function (string, character, width) {
    var str = string || ''
      , width;
    str = String(str);

    // Should width be string.length + 1? or the same to be safe
    width = parseInt(width, 10) || str.length;
    character = character || ' ';

    while (str.length < width) {
      str += character;
    }
    return str;
  };

  /**
    @name string#pad
    @public
    @function
    @return {String} Returns the padded string
    @description Pad adds `char` to the left and right of `string` until the length
                 of `string` is more than `width`
    @param {String} string The string to pad
    @param {String} character The character to pad with
    @param {Number} width the width to pad to
  */
  this.pad = function (string, character, width) {
    var str = string || ''
      , width;
    str = String(str);

    // Should width be string.length + 1? or the same to be safe
    width = parseInt(width, 10) || str.length;
    character = character || ' ';

    while (str.length < width) {
      str = character + str + character;
    }
    return str;
  };

  /**
    @name string#truncate
    @public
    @function
    @return {String} Returns the truncated string
    @description Truncates a given `string` after a specified `length` if `string` is longer than
                 `length`. The last characters will be replaced with an `omission` for a total length
                 not exceeding `length`. If `callback` is given it will fire if `string` is truncated.
    @param {String} string The string to truncate
    @param {Integer/Object} options Options for truncation, If options is an Integer it will be length
      @param {Integer} [options.length=string.length] Length the output string will be
      @param {Integer} [options.len] Alias for `length`
      @param {String} [options.omission='...'] Replace last characters with an omission
      @param {String} [options.ellipsis='...'] Alias for `omission`
      @param {String/RegExp} [options.seperator] Break the truncated test at the nearest `seperator`
    @param {Function} callback Callback is called only if a truncation is done
  */
  this.truncate = function (string, options, callback) {
    var str = string || ''
      , stringLen
      , opts
      , stringLenWithOmission
      , last
      , ignoreCase
      , multiLine
      , stringToWorkWith
      , lastIndexOf
      , nextStop
      , result
      , returnString;

    str = String(str);
    stringLen = str.length

    // If `options` is a number, assume it's the length and
    // create a options object with length
    if (typeof options === 'number') {
      opts = {
        length: options
      };
    }
    else {
      opts = options || {};
    }

    // Set `opts` defaults
    opts.length = opts.length || stringLen;
    opts.omission = opts.omission || opts.ellipsis || '...';

    stringLenWithOmission = opts.length - opts.omission.length;

    // Set the index to stop at for `string`
    if (opts.seperator) {
      if (opts.seperator instanceof RegExp) {
        // If `seperator` is a regex
        if (opts.seperator.global) {
          opts.seperator = opts.seperator;
        } else {
          ignoreCase = opts.seperator.ignoreCase ? 'i' : ''
          multiLine = opts.seperator.multiLine ? 'm' : '';
          opts.seperator = new RegExp(opts.seperator.source,
              'g' + ignoreCase + multiLine);
        }
        stringToWorkWith = str.substring(0, stringLenWithOmission + 1)
        lastIndexOf = -1
        nextStop = 0

        while ((result = opts.seperator.exec(stringToWorkWith))) {
          lastIndexOf = result.index;
          opts.seperator.lastIndex = ++nextStop;
        }
        last = lastIndexOf;
      }
      else {
        // Seperator is a String
        last = str.lastIndexOf(opts.seperator, stringLenWithOmission);
      }

      // If the above couldn't be found, they'll default to -1 so,
      // we need to just set it as `stringLenWithOmission`
      if (last === -1) {
        last = stringLenWithOmission;
      }
    }
    else {
      last = stringLenWithOmission;
    }

    if (stringLen < opts.length) {
      return str;
    }
    else {
      returnString = str.substring(0, last) + opts.omission;
      returnString += callback && typeof callback === 'function' ? callback() : '';
      return returnString;
    }
  };

  /**
    @name string#truncateHTML
    @public
    @function
    @return {String} Returns the HTML safe truncated string
    @description Truncates a given `string` inside HTML tags after a specified `length` if string`
                 is longer than `length`. The last characters will be replaced with an `omission`
                 for a total length not exceeding `length`. If `callback` is given it will fire if
                 `string` is truncated. If `once` is true only the first string in the first HTML
                 tags will be truncated leaving the others as they were
    @param {String} string The string to truncate
    @param {Integer/Object} options Options for truncation, If options is an Integer it will be length
                            all Object options are the same as `truncate`
      @param {Boolean} [options.once=false] If true, it will only be truncated once, otherwise the
                                            truncation will loop through all text inside HTML tags
    @param {Function} callback Callback is called only if a truncation is done
  */
  this.truncateHTML = function (string, options, callback) {
    var str = string || ''
      , returnString = ''
      , opts = options;

    str = String(str);

    // If `options` is a number assume it's the length and create a options object with length
    if (typeof opts === 'number') {
      var num = opts;

      opts = {};
      opts.length = num;
    } else opts = opts || {};

    // Set `default` options for HTML specifics
    opts.once = opts.once || false;

    var pat = /(<[^>]*>)/ // Patter for matching HTML tags
      , arr = [] // Holds the HTML tags and content seperately
      , truncated = false
      , result = pat.exec(str)
      , item
      , firstPos
      , lastPos
      , i;

    // Gather the HTML tags and content into the array
    while (result) {
      firstPos = result.index;
      lastPos = pat.lastIndex;

      if (firstPos !== 0) {
        // Should be content not HTML tags
        arr.push(str.substring(0, firstPos));
        // Slice content from string
        str = str.slice(firstPos);
      }

      arr.push(result[0]); // Push HTML tags
      str = str.slice(result[0].length);

      // Re-run the pattern on the new string
      result = pat.exec(str);
    }
    if (str !== '') {
      arr.push(str);
    }

    // Loop through array items appending the tags to the string,
    // - and truncating the text then appending it to content
    i = -1;
    while (++i < arr.length) {
      item = arr[i];
      switch (true) {
        // Closing tag
        case item.indexOf('</') == 0:
          returnString += item;
          openTag = null;
          break;
        // Opening tag
        case item.indexOf('<') == 0:
          returnString += item;
          openTag = item;
          break;
        // Normal text
        default:
          if (opts.once && truncated) {
            returnString += item;
          } else {
            returnString += this.truncate(item, opts, callback);
            truncated = true;
          }
          break;
      }
    }

    return returnString;
  };

  /**
    @name string#nl2br
    @public
    @function
    @return {String} The string with converted newlines chars to br tags
    @description Nl2br returns a string where all newline chars are turned
                 into line break HTML tags
    @param {String} string The string to convert
  */
  this.nl2br = function (string) {
    var str = string || '';
    str = String(str);

    return str.replace(_NL,'<br />');
  };

  /**
    @name string#snakeize
    @public
    @function
    @return {String} The string in a snake_case version
    @description Snakeize converts camelCase and CamelCase strings to snake_case strings
    @param {String} string The string to convert to snake_case
    @param {String} separ='_' The seperator to use
  */
  this.snakeize = (function () {
    // Only create regexes once on initial load
    var repl = /([A-Z]+)/g
      , lead = /^_/g;
    return function (string, separ) {
      var str = string || ''
        , sep = separ || '_'
        , leading = separ ? new RegExp('^' + sep, 'g') : lead;
      str = String(str);
      return str.replace(repl, sep + '$1').toLowerCase().
        replace(leading, '');
    };
  }).call(this);

  // Aliases
  /**
    @name string#underscorize
    @public
    @function
    @return {String} The string in a underscorized version
    @description Underscorize returns the given `string` converting camelCase and snakeCase to underscores
    @param {String} string The string to underscorize
  */
  this.underscorize = this.snakeize;
  this.underscoreize = this.snakeize;
  this.decamelize = this.snakeize;

  /**
    @name string#camelize
    @public
    @function
    @return {String} The string in a camelCase version
    @description Camelize takes a string and optional options and
                 returns a camelCase version of the given `string`
    @param {String} string The string to convert to camelCase
    @param {Object} options
      @param {Boolean} [options.initialCap] If initialCap is true the returned
                                            string will have a capitalized first letter
      @param {Boolean} [options.leadingUnderscore] If leadingUnderscore os true then if
                                                   an underscore exists at the beggining
                                                   of the string, it will stay there.
                                                   Otherwise it'll be removed.
  */
  this.camelize = (function () {
    // Only create regex once on initial load
    var repl = /[-_](\w)/g;
    return function (string, options) {
      var str = string || ''
        , ret
        , config = {
            initialCap: false
          , leadingUnderscore: false
          }
        , opts = options || {};

      str = String(str);

      // Backward-compat
      if (typeof opts == 'boolean') {
        config = {
          initialCap: true
        };
      }
      else {
        core.mixin(config, opts);
      }

      ret = str.replace(repl, function (m, m1) {
        return m1.toUpperCase();
      });

      if (config.leadingUnderscore & str.indexOf('_') === 0) {
        ret = '_' + this.decapitalize(ret);
      }
      // If initialCap is true capitalize it
      ret = config.initialCap ? this.capitalize(ret) : this.decapitalize(ret);

      return ret;
    };
  }).call(this);

  /**
    @name string#decapitalize
    @public
    @function
    @return {String} The string with the first letter decapitalized
    @description Decapitalize returns the given string with the first letter uncapitalized.
    @param {String} string The string to decapitalize
  */
  this.decapitalize = function (string) {
    var str = string || '';
    str = String(str);

    return str.substr(0, 1).toLowerCase() + str.substr(1);
  };

  /**
    @name string#capitalize
    @public
    @function
    @return {String} The string with the first letter capitalized
    @description capitalize returns the given string with the first letter capitalized.
    @param {String} string The string to capitalize
  */
  this.capitalize = function (string) {
    var str = string || '';
    str = String(str);

    return str.substr(0, 1).toUpperCase() + str.substr(1);
  };

  /**
    @name string#dasherize
    @public
    @function
    @return {String} The string in a dashed version
    @description Dasherize returns the given `string` converting camelCase and snakeCase
                 to dashes or replace them with the `replace` character.
    @param {String} string The string to dasherize
    @param {String} replace='-' The character to replace with
  */
  this.dasherize = function (string, replace) {
    var repl = replace || '-'
    return this.snakeize(string, repl);
  };

  /**
    @name string#include
    @public
    @function
    @return {Boolean} Returns true if the string is found in the string to search
    @description Searches for a particular string in another string
    @param {String} searchIn The string to search for the other string in
    @param {String} searchFor The string to search for
  */
  this.include = function (searchIn, searchFor) {
    var str = searchFor;
    if (!str && typeof string != 'string') {
      return false;
    }
    str = String(str);
    return (searchIn.indexOf(str) > -1);
  };

  /*
   * getInflections(name<String>, initialCap<String>)
   *
   * Inflection returns an object that contains different inflections
   * created from the given `name`
  */

  /**
    @name string#getInflections
    @public
    @function
    @return {Object} A Object containing multiple different inflects for the given `name`
    @description Inflection returns an object that contains different inflections
                 created from the given `name`
    @param {String} name The string to create inflections from
  */
  this.getInflections = function (name) {
    if (!name) {
      return;
    }

    var self = this
        // Use plural version to fix possible mistakes(e,g,. thingie instead of thingy)
      , normalizedName = this.snakeize(inflection.pluralize(name))
      , nameSingular = inflection.singularize(normalizedName)
      , namePlural = inflection.pluralize(normalizedName);

    return {
      // For filepaths or URLs
      filename: {
        // neil_peart
        singular: nameSingular
        // neil_pearts
      , plural: namePlural
      }
      // Constructor names
    , constructor: {
        // NeilPeart
        singular: self.camelize(nameSingular, {initialCap: true})
        // NeilPearts
      , plural: self.camelize(namePlural, {initialCap: true})
      }
    , property: {
        // neilPeart
        singular: self.camelize(nameSingular)
        // neilPearts
      , plural: self.camelize(namePlural)
      }
    };
  };

  /**
    @name string#getInflection
    @public
    @function
    @return {Object} A Object containing multiple different inflects for the given `name`
    @description Inflection returns an object that contains different inflections
                 created from the given `name`
    @param {String} name The string to create inflections from
  */
  this.getInflection = function (name, key, pluralization) {
    var infl = this.getInflections(name);
    return infl[key][pluralization];
  };

  // From Math.uuid.js, https://github.com/broofa/node-uuid
  // Robert Kieffer (robert@broofa.com), MIT license
  this.uuid = function (length, radix) {
    var chars = _UUID_CHARS
      , uuid = []
      , r
      , i;

    radix = radix || chars.length;

    if (length) {
      // Compact form
      i = -1;
      while (++i < length) {
        uuid[i] = chars[0 | Math.random()*radix];
      }
    } else {
      // rfc4122, version 4 form

      // rfc4122 requires these characters
      uuid[8] = uuid[13] = uuid[18] = uuid[23] = '-';
      uuid[14] = '4';

      // Fill in random data.  At i==19 set the high bits of clock sequence as
      // per rfc4122, sec. 4.1.5
      i = -1;
      while (++i < 36) {
        if (!uuid[i]) {
          r = 0 | Math.random()*16;
          uuid[i] = chars[(i == 19) ? (r & 0x3) | 0x8 : r];
        }
      }
    }

    return uuid.join('');
  };
  
  /**
    @name string#stripTags
    @public
    @function
    @return {String} A String with HTML tags removed.
    @description Strips HTML tags from a string.
    @param {String} The string to strip HTML tags from
    @param {String|Array} A String or Array containing allowed tags. e.g. "<br><p>"
  */
  this.stripTags = function(string, allowed) {
    // taken from http://phpjs.org/functions/strip_tags/
    var allowed = (((allowed || "") + "").toLowerCase().match(/<[a-z][a-z0-9]*>/g) || []).join(''); // making sure the allowed arg is a string containing only tags in lowercase (<a><b><c>)
    var tags = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi,
    comments = /<!--[\s\S]*?-->/gi;
    return string.replace(comments, '').replace(tags, function ($0, $1) {
      return allowed.indexOf('<' + $1.toLowerCase() + '>') > -1 ? $0 : '';
    });
  }

})();

module.exports = string;


},{"./core":20,"./inflection":26}],33:[function(require,module,exports){
/*
 * Utilities: A classic collection of JavaScript utilities
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/
var uri
  , string = require('./string');

/**
  @name uri
  @namespace uri
*/

uri = new (function () {
  var _isArray = function (obj) {
    return obj &&
      typeof obj === 'object' &&
      typeof obj.length === 'number' &&
      typeof obj.splice === 'function' &&
      !(obj.propertyIsEnumerable('length'));
  };

  /**
    @name uri#getFileExtension
    @public
    @function
    @return {String} Returns the file extension for a given path
    @description Gets the file extension for a path and returns it
    @param {String} path The path to get the extension for
  */
  this.getFileExtension = function (path) {
    var match;
    if (path) {
      match = /.+\.(\w{2,4}$)/.exec(path);
    }
    return (match && match[1]) || '';
  };

  /**
    @name uri#paramify
    @public
    @function
    @return {String} Returns a querystring contains the given values
    @description Convert a JS Object to a querystring (key=val&key=val). Values in arrays
      will be added as multiple parameters
    @param {Object} obj An Object containing only scalars and arrays
    @param {Object} o The options to use for formatting
      @param {Boolean} [o.consolidate=false] take values from elements that can return
        multiple values (multi-select, checkbox groups) and collapse into a single,
        comman-delimited value.
      @param {Boolean} [o.includeEmpty=false] include keys in the string for all elements, even
        they have no value set (e.g., even if elemB has no value: elemA=foo&elemB=&elemC=bar).
        Note that some false-y values are always valid even without this option, [0, ''].
        This option extends coverage to [null, undefined, NaN]
      @param {Boolean} [o.snakeize=false] change param names from camelCase to snake_case.
      @param {Boolean} [o.escapeVals=false] escape the values for XML entities.
  */
  this.paramify = function (obj, o) {
    var opts = o || {},
        str = '',
        key,
        val,
        isValid,
        itemArray,
        arr = [],
        arrVal;

    for (var p in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, p)) {
        val = obj[p];

        // This keeps valid falsy values like false and 0
        // It's duplicated in the array block below. Could
        // put it in a function but don't want the overhead
        isValid = !( val === null || val === undefined ||
                    (typeof val === 'number' && isNaN(val)) );

        key = opts.snakeize ? string.snakeize(p) : p;
        if (isValid) {
          // Multiple vals -- array
          if (_isArray(val) && val.length) {
            itemArray = [];
            for (var i = 0, ii = val.length; i < ii; i++) {
              arrVal = val[i];
              // This keeps valid falsy values like false and 0
              isValid = !( arrVal === null || arrVal === undefined ||
                           (typeof arrVal === 'number' && isNaN(arrVal)) );

              itemArray[i] = isValid ? encodeURIComponent(arrVal) : '';
              if (opts.escapeVals) {
                itemArray[i] = string.escapeXML(itemArray[i]);
              }
            }
            // Consolidation mode -- single value joined on comma
            if (opts.consolidate) {
              arr.push(key + '=' + itemArray.join(','));
            }
            // Normal mode -- multiple, same-named params with each val
            else {
              // {foo: [1, 2, 3]} => 'foo=1&foo=2&foo=3'
              // Add into results array, as this just ends up getting
              // joined on ampersand at the end anyhow
              arr.push(key + '=' + itemArray.join('&' + key + '='));
            }
          }
          // Single val -- string
          else {
            if (opts.escapeVals) {
              val = string.escapeXML(val);
            }
            arr.push(key + '=' + encodeURIComponent(val));
          }
          str += '&';
        }
        else {
          if (opts.includeEmpty) { arr.push(key + '='); }
        }
      }
    }
    return arr.join('&');
  };

  /**
    @name uri#objectify
    @public
    @function
    @return {Object} JavaScript key/val object with the values from the querystring
    @description Convert the values in a query string (key=val&key=val) to an Object
    @param {String} str The querystring to convert to an object
    @param {Object} o The options to use for formatting
      @param {Boolean} [o.consolidate=true] Convert multiple instances of the same
        key into an array of values instead of overwriting
  */
  this.objectify = function (str, o) {
    var opts = o || {};
    var d = {};
    var consolidate = typeof opts.consolidate == 'undefined' ?
        true : opts.consolidate;
    if (str) {
      var arr = str.split('&');
      for (var i = 0; i < arr.length; i++) {
        var pair = arr[i].split('=');
        var name = pair[0];
        var val = decodeURIComponent(pair[1] || '');
        // "We've already got one!" -- arrayize if the flag
        // is set
        if (typeof d[name] != 'undefined' && consolidate) {
          if (typeof d[name] == 'string') {
            d[name] = [d[name]];
          }
          d[name].push(val);
        }
        // Otherwise just set the value
        else {
          d[name] = val;
        }
      }
    }
    return d;
  };

})();

module.exports = uri;


},{"./string":32}],34:[function(require,module,exports){
/*
 * Utilities: A classic collection of JavaScript utilities
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/
var core = require('./core')
  , inflection = require('./inflection')

/**
  @name xml
  @namespace xml
*/

exports.XML = new (function () {

  // Default indention level
  var indentLevel = 4
    , tagFromType
    , obj2xml;

  tagFromType = function (item, prev) {
    var ret
      , type
      , types;

    if (item instanceof Array) {
      ret = 'array';
    } else {
      types = ['string', 'number', 'boolean', 'object'];
      for (var i = 0, ii = types.length; i < ii; i++) {
        type = types[i];
        if (typeof item == type) {
          ret = type;
        }
      }
    }

    if (prev && ret != prev) {
      return 'record'
    } else {
      return ret;
    }
  };

  obj2xml = function (o, opts) {
    var name = opts.name
      , level = opts.level
      , arrayRoot = opts.arrayRoot
      , pack
      , item
      , n
      , currentIndent = (new Array(level * indentLevel)).join(' ')
      , nextIndent = (new Array((level + 1) * indentLevel)).join(' ')
      , xml = '';

    switch (typeof o) {
      case 'string':
      case 'number':
      case 'boolean':
        xml = o.toString();
        break;
      case 'object':
        // Arrays
        if (o instanceof Array) {

          // Pack the processed version of each item into an array that
          // can be turned into a tag-list with a `join` method below
          // As the list gets iterated, if all items are the same type,
          // that's the tag-name for the individual tags. If the items are
          // a mixed, the tag-name is 'record'
          pack = [];
          for (var i = 0, ii = o.length; i < ii; i++) {
            item = o[i];
            if (!name) {
              // Pass any previous tag-name, so it's possible to know if
              // all items are the same type, or it's mixed types
              n = tagFromType(item, n);
            }
            pack.push(obj2xml(item, {
              name: name
            , level: level + 1
            , arrayRoot: arrayRoot
            }));
          }

          // If this thing is attached to a named property on an object,
          // use the name for the containing tag-name
          if (name) {
            n = name;
          }

          // If this is a top-level item, wrap in a top-level containing tag
          if (level == 0) {
            xml += currentIndent + '<' + inflection.pluralize(n) + ' type="array">\n'
          }
          xml += nextIndent + '<' + n + '>' +
              pack.join('</' + n + '>\n' + nextIndent +
                  '<' + n + '>') + '</' + n + '>\n';

          // If this is a top-level item, close the top-level containing tag
          if (level == 0) {
            xml += currentIndent + '</' + inflection.pluralize(n) + '>';
          }
        }
        // Generic objects
        else {
          n = name || 'object';

          // If this is a top-level item, wrap in a top-level containing tag
          if (level == 0) {
            xml += currentIndent + '<' + n;
            // Lookahead hack to allow tags to have attributes
            for (var p in o) {
              if (p.indexOf('attr:') == 0) {
                xml += ' ' + p.replace(/^attr:/, '') + '="' +
                    o[p] + '"'
              }
            }
            xml += '>\n';
          }
          for (var p in o) {
            item = o[p];

            // Data properties only
            if (typeof item == 'function') {
              continue;
            }
            // No attr hack properties
            if (p.indexOf('attr:') == 0) {
              continue;
            }

            xml += nextIndent;

            if (p == '#cdata') {
              xml += '<![CDATA[' + item + ']]>\n';
            }
            else {

              // Complex values, going to have items with multiple tags
              // inside
              if (typeof item == 'object') {
                if (item instanceof Array) {
                  if (arrayRoot) {
                    xml += '<' + p + ' type="array">\n'
                  }
                }
                else {
                  xml += '<' + p;
                  // Lookahead hack to allow tags to have attributes
                  for (var q in item) {
                    if (q.indexOf('attr:') == 0) {
                      xml += ' ' + q.replace(/^attr:/, '') + '="' +
                          item[q] + '"'
                    }
                  }
                  xml += '>\n';
                }
              }
              // Scalars, just a value and closing tag
              else {
                xml += '<' + p + '>'
              }
              xml += obj2xml(item, {
                name: p
              , level: level + 1
              , arrayRoot: arrayRoot
              });

              // Objects and Arrays, need indentation before closing tag
              if (typeof item == 'object') {
                if (item instanceof Array) {
                  if (arrayRoot) {
                    xml += nextIndent;
                    xml += '</' + p + '>\n';
                  }
                }
                else {
                  xml += nextIndent;
                  xml += '</' + p + '>\n';
                }
              }
              // Scalars, just close
              else {
                xml += '</' + p + '>\n';
              }
            }
          }
          // If this is a top-level item, close the top-level containing tag
          if (level == 0) {
            xml += currentIndent + '</' + n + '>\n';
          }
        }
        break;
      default:
        // No default
    }
    return xml;
  }

  /*
   * XML configuration
   *
  */
  this.config = {
      whitespace: true
    , name: null
    , fragment: false
    , level: 0
    , arrayRoot: true
  };

  /**
    @name xml#setIndentLevel
    @public
    @function
    @return {Number} Return the given `level`
    @description SetIndentLevel changes the indent level for XML.stringify and returns it
    @param {Number} level The indent level to use
  */
  this.setIndentLevel = function (level) {
    if(!level) {
      return;
    }

    return indentLevel = level;
  };

  /**
    @name xml#stringify
    @public
    @function
    @return {String} Return the XML entities of the given `obj`
    @description Stringify returns an XML representation of the given `obj`
    @param {Object} obj The object containing the XML entities to use
    @param {Object} opts
      @param {Boolean} [opts.whitespace=true] Don't insert indents and newlines after xml entities
      @param {String} [opts.name=typeof obj] Use custom name as global namespace
      @param {Boolean} [opts.fragment=false] If true no header fragment is added to the top
      @param {Number} [opts.level=0] Remove this many levels from the output
      @param {Boolean} [opts.arrayRoot=true]
  */
  this.stringify = function (obj, opts) {
    var config = core.mixin({}, this.config)
      , xml = '';
    core.mixin(config, (opts || {}));

    if (!config.whitespace) {
      indentLevel = 0;
    }

    if (!config.fragment) {
      xml += '<?xml version="1.0" encoding="UTF-8"?>\n';
    }

    xml += obj2xml(obj, {
      name: config.name
    , level: config.level
    , arrayRoot: config.arrayRoot
    });

    if (!config.whitespace) {
      xml = xml.replace(/>\n/g, '>');
    }

    return xml;
  };

})();


},{"./core":20,"./inflection":26}],35:[function(require,module,exports){
window.geddy       = {};
window.geddy.model = require('../lib/index.js');
},{"../lib/index.js":11}],36:[function(require,module,exports){

},{}],37:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
  // because we need to be able to add all the node Buffer API methods. This is an issue
  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // assume that object is array-like
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    if (Buffer.isBuffer(subject)) {
      for (i = 0; i < length; i++)
        buf[i] = subject.readUInt8(i)
    } else {
      for (i = 0; i < length; i++)
        buf[i] = ((subject[i] % 256) + 256) % 256
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str.toString()
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list[, length])')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (totalLength === undefined) {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

Buffer.compare = function (a, b) {
  assert(Buffer.isBuffer(a) && Buffer.isBuffer(b), 'Arguments must be Buffers')
  var x = a.length
  var y = b.length
  for (var i = 0, len = Math.min(x, y); i < len && a[i] === b[i]; i++) {}
  if (i !== len) {
    x = a[i]
    y = b[i]
  }
  if (x < y) {
    return -1
  }
  if (y < x) {
    return 1
  }
  return 0
}

// BUFFER INSTANCE METHODS
// =======================

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function asciiWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function utf16leWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end === undefined) ? self.length : Number(end)

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = asciiSlice(self, start, end)
      break
    case 'binary':
      ret = binarySlice(self, start, end)
      break
    case 'base64':
      ret = base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

Buffer.prototype.equals = function (b) {
  assert(Buffer.isBuffer(b), 'Argument must be a Buffer')
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.compare = function (b) {
  assert(Buffer.isBuffer(b), 'Argument must be a Buffer')
  return Buffer.compare(this, b)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !Buffer._useTypedArrays) {
    for (var i = 0; i < len; i++) {
      target[i + target_start] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function binarySlice (buf, start, end) {
  return asciiSlice(buf, start, end)
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return readUInt16(this, offset, false, noAssert)
}

function readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return readInt16(this, offset, false, noAssert)
}

function readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return readInt32(this, offset, false, noAssert)
}

function readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return readFloat(this, offset, false, noAssert)
}

function readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
  return offset + 1
}

function writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
  return offset + 2
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  return writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  return writeUInt16(this, value, offset, false, noAssert)
}

function writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
  return offset + 4
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  return writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  return writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
  return offset + 1
}

function writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
  return offset + 2
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  return writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  return writeInt16(this, value, offset, false, noAssert)
}

function writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
  return offset + 4
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  return writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  return writeInt32(this, value, offset, false, noAssert)
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F) {
      byteArray.push(b)
    } else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++) {
        byteArray.push(parseInt(h[j], 16))
      }
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":38,"ieee754":39}],38:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],39:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],40:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        throw TypeError('Uncaught, unspecified "error" event.');
      }
      return false;
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],41:[function(require,module,exports){
var http = module.exports;
var EventEmitter = require('events').EventEmitter;
var Request = require('./lib/request');
var url = require('url')

http.request = function (params, cb) {
    if (typeof params === 'string') {
        params = url.parse(params)
    }
    if (!params) params = {};
    if (!params.host && !params.port) {
        params.port = parseInt(window.location.port, 10);
    }
    if (!params.host && params.hostname) {
        params.host = params.hostname;
    }
    
    if (!params.scheme) params.scheme = window.location.protocol.split(':')[0];
    if (!params.host) {
        params.host = window.location.hostname || window.location.host;
    }
    if (/:/.test(params.host)) {
        if (!params.port) {
            params.port = params.host.split(':')[1];
        }
        params.host = params.host.split(':')[0];
    }
    if (!params.port) params.port = params.scheme == 'https' ? 443 : 80;
    
    var req = new Request(new xhrHttp, params);
    if (cb) req.on('response', cb);
    return req;
};

http.get = function (params, cb) {
    params.method = 'GET';
    var req = http.request(params, cb);
    req.end();
    return req;
};

http.Agent = function () {};
http.Agent.defaultMaxSockets = 4;

var xhrHttp = (function () {
    if (typeof window === 'undefined') {
        throw new Error('no window object present');
    }
    else if (window.XMLHttpRequest) {
        return window.XMLHttpRequest;
    }
    else if (window.ActiveXObject) {
        var axs = [
            'Msxml2.XMLHTTP.6.0',
            'Msxml2.XMLHTTP.3.0',
            'Microsoft.XMLHTTP'
        ];
        for (var i = 0; i < axs.length; i++) {
            try {
                var ax = new(window.ActiveXObject)(axs[i]);
                return function () {
                    if (ax) {
                        var ax_ = ax;
                        ax = null;
                        return ax_;
                    }
                    else {
                        return new(window.ActiveXObject)(axs[i]);
                    }
                };
            }
            catch (e) {}
        }
        throw new Error('ajax not supported in this browser')
    }
    else {
        throw new Error('ajax not supported in this browser');
    }
})();

http.STATUS_CODES = {
    100 : 'Continue',
    101 : 'Switching Protocols',
    102 : 'Processing',                 // RFC 2518, obsoleted by RFC 4918
    200 : 'OK',
    201 : 'Created',
    202 : 'Accepted',
    203 : 'Non-Authoritative Information',
    204 : 'No Content',
    205 : 'Reset Content',
    206 : 'Partial Content',
    207 : 'Multi-Status',               // RFC 4918
    300 : 'Multiple Choices',
    301 : 'Moved Permanently',
    302 : 'Moved Temporarily',
    303 : 'See Other',
    304 : 'Not Modified',
    305 : 'Use Proxy',
    307 : 'Temporary Redirect',
    400 : 'Bad Request',
    401 : 'Unauthorized',
    402 : 'Payment Required',
    403 : 'Forbidden',
    404 : 'Not Found',
    405 : 'Method Not Allowed',
    406 : 'Not Acceptable',
    407 : 'Proxy Authentication Required',
    408 : 'Request Time-out',
    409 : 'Conflict',
    410 : 'Gone',
    411 : 'Length Required',
    412 : 'Precondition Failed',
    413 : 'Request Entity Too Large',
    414 : 'Request-URI Too Large',
    415 : 'Unsupported Media Type',
    416 : 'Requested Range Not Satisfiable',
    417 : 'Expectation Failed',
    418 : 'I\'m a teapot',              // RFC 2324
    422 : 'Unprocessable Entity',       // RFC 4918
    423 : 'Locked',                     // RFC 4918
    424 : 'Failed Dependency',          // RFC 4918
    425 : 'Unordered Collection',       // RFC 4918
    426 : 'Upgrade Required',           // RFC 2817
    428 : 'Precondition Required',      // RFC 6585
    429 : 'Too Many Requests',          // RFC 6585
    431 : 'Request Header Fields Too Large',// RFC 6585
    500 : 'Internal Server Error',
    501 : 'Not Implemented',
    502 : 'Bad Gateway',
    503 : 'Service Unavailable',
    504 : 'Gateway Time-out',
    505 : 'HTTP Version Not Supported',
    506 : 'Variant Also Negotiates',    // RFC 2295
    507 : 'Insufficient Storage',       // RFC 4918
    509 : 'Bandwidth Limit Exceeded',
    510 : 'Not Extended',               // RFC 2774
    511 : 'Network Authentication Required' // RFC 6585
};
},{"./lib/request":42,"events":40,"url":67}],42:[function(require,module,exports){
var Stream = require('stream');
var Response = require('./response');
var Base64 = require('Base64');
var inherits = require('inherits');

var Request = module.exports = function (xhr, params) {
    var self = this;
    self.writable = true;
    self.xhr = xhr;
    self.body = [];
    
    self.uri = (params.scheme || 'http') + '://'
        + params.host
        + (params.port ? ':' + params.port : '')
        + (params.path || '/')
    ;
    
    if (typeof params.withCredentials === 'undefined') {
        params.withCredentials = true;
    }

    try { xhr.withCredentials = params.withCredentials }
    catch (e) {}
    
    xhr.open(
        params.method || 'GET',
        self.uri,
        true
    );

    self._headers = {};
    
    if (params.headers) {
        var keys = objectKeys(params.headers);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (!self.isSafeRequestHeader(key)) continue;
            var value = params.headers[key];
            self.setHeader(key, value);
        }
    }
    
    if (params.auth) {
        //basic auth
        this.setHeader('Authorization', 'Basic ' + Base64.btoa(params.auth));
    }

    var res = new Response;
    res.on('close', function () {
        self.emit('close');
    });
    
    res.on('ready', function () {
        self.emit('response', res);
    });
    
    xhr.onreadystatechange = function () {
        // Fix for IE9 bug
        // SCRIPT575: Could not complete the operation due to error c00c023f
        // It happens when a request is aborted, calling the success callback anyway with readyState === 4
        if (xhr.__aborted) return;
        res.handle(xhr);
    };
};

inherits(Request, Stream);

Request.prototype.setHeader = function (key, value) {
    this._headers[key.toLowerCase()] = value
};

Request.prototype.getHeader = function (key) {
    return this._headers[key.toLowerCase()]
};

Request.prototype.removeHeader = function (key) {
    delete this._headers[key.toLowerCase()]
};

Request.prototype.write = function (s) {
    this.body.push(s);
};

Request.prototype.destroy = function (s) {
    this.xhr.__aborted = true;
    this.xhr.abort();
    this.emit('close');
};

Request.prototype.end = function (s) {
    if (s !== undefined) this.body.push(s);

    var keys = objectKeys(this._headers);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = this._headers[key];
        if (isArray(value)) {
            for (var j = 0; j < value.length; j++) {
                this.xhr.setRequestHeader(key, value[j]);
            }
        }
        else this.xhr.setRequestHeader(key, value)
    }

    if (this.body.length === 0) {
        this.xhr.send('');
    }
    else if (typeof this.body[0] === 'string') {
        this.xhr.send(this.body.join(''));
    }
    else if (isArray(this.body[0])) {
        var body = [];
        for (var i = 0; i < this.body.length; i++) {
            body.push.apply(body, this.body[i]);
        }
        this.xhr.send(body);
    }
    else if (/Array/.test(Object.prototype.toString.call(this.body[0]))) {
        var len = 0;
        for (var i = 0; i < this.body.length; i++) {
            len += this.body[i].length;
        }
        var body = new(this.body[0].constructor)(len);
        var k = 0;
        
        for (var i = 0; i < this.body.length; i++) {
            var b = this.body[i];
            for (var j = 0; j < b.length; j++) {
                body[k++] = b[j];
            }
        }
        this.xhr.send(body);
    }
    else {
        var body = '';
        for (var i = 0; i < this.body.length; i++) {
            body += this.body[i].toString();
        }
        this.xhr.send(body);
    }
};

// Taken from http://dxr.mozilla.org/mozilla/mozilla-central/content/base/src/nsXMLHttpRequest.cpp.html
Request.unsafeHeaders = [
    "accept-charset",
    "accept-encoding",
    "access-control-request-headers",
    "access-control-request-method",
    "connection",
    "content-length",
    "cookie",
    "cookie2",
    "content-transfer-encoding",
    "date",
    "expect",
    "host",
    "keep-alive",
    "origin",
    "referer",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "user-agent",
    "via"
];

Request.prototype.isSafeRequestHeader = function (headerName) {
    if (!headerName) return false;
    return indexOf(Request.unsafeHeaders, headerName.toLowerCase()) === -1;
};

var objectKeys = Object.keys || function (obj) {
    var keys = [];
    for (var key in obj) keys.push(key);
    return keys;
};

var isArray = Array.isArray || function (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
};

var indexOf = function (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (xs[i] === x) return i;
    }
    return -1;
};

},{"./response":43,"Base64":44,"inherits":46,"stream":66}],43:[function(require,module,exports){
var Stream = require('stream');
var util = require('util');

var Response = module.exports = function (res) {
    this.offset = 0;
    this.readable = true;
};

util.inherits(Response, Stream);

var capable = {
    streaming : true,
    status2 : true
};

function parseHeaders (res) {
    var lines = res.getAllResponseHeaders().split(/\r?\n/);
    var headers = {};
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line === '') continue;
        
        var m = line.match(/^([^:]+):\s*(.*)/);
        if (m) {
            var key = m[1].toLowerCase(), value = m[2];
            
            if (headers[key] !== undefined) {
            
                if (isArray(headers[key])) {
                    headers[key].push(value);
                }
                else {
                    headers[key] = [ headers[key], value ];
                }
            }
            else {
                headers[key] = value;
            }
        }
        else {
            headers[line] = true;
        }
    }
    return headers;
}

Response.prototype.getResponse = function (xhr) {
    var respType = String(xhr.responseType).toLowerCase();
    if (respType === 'blob') return xhr.responseBlob || xhr.response;
    if (respType === 'arraybuffer') return xhr.response;
    return xhr.responseText;
}

Response.prototype.getHeader = function (key) {
    return this.headers[key.toLowerCase()];
};

Response.prototype.handle = function (res) {
    if (res.readyState === 2 && capable.status2) {
        try {
            this.statusCode = res.status;
            this.headers = parseHeaders(res);
        }
        catch (err) {
            capable.status2 = false;
        }
        
        if (capable.status2) {
            this.emit('ready');
        }
    }
    else if (capable.streaming && res.readyState === 3) {
        try {
            if (!this.statusCode) {
                this.statusCode = res.status;
                this.headers = parseHeaders(res);
                this.emit('ready');
            }
        }
        catch (err) {}
        
        try {
            this._emitData(res);
        }
        catch (err) {
            capable.streaming = false;
        }
    }
    else if (res.readyState === 4) {
        if (!this.statusCode) {
            this.statusCode = res.status;
            this.emit('ready');
        }
        this._emitData(res);
        
        if (res.error) {
            this.emit('error', this.getResponse(res));
        }
        else this.emit('end');
        
        this.emit('close');
    }
};

Response.prototype._emitData = function (res) {
    var respBody = this.getResponse(res);
    if (respBody.toString().match(/ArrayBuffer/)) {
        this.emit('data', new Uint8Array(respBody, this.offset));
        this.offset = respBody.byteLength;
        return;
    }
    if (respBody.length > this.offset) {
        this.emit('data', respBody.slice(this.offset));
        this.offset = respBody.length;
    }
};

var isArray = Array.isArray || function (xs) {
    return Object.prototype.toString.call(xs) === '[object Array]';
};

},{"stream":66,"util":69}],44:[function(require,module,exports){
;(function () {

  var object = typeof exports != 'undefined' ? exports : this; // #8: web workers
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  function InvalidCharacterError(message) {
    this.message = message;
  }
  InvalidCharacterError.prototype = new Error;
  InvalidCharacterError.prototype.name = 'InvalidCharacterError';

  // encoder
  // [https://gist.github.com/999166] by [https://github.com/nignag]
  object.btoa || (
  object.btoa = function (input) {
    for (
      // initialize result and counter
      var block, charCode, idx = 0, map = chars, output = '';
      // if the next input index does not exist:
      //   change the mapping table to "="
      //   check if d has no fractional digits
      input.charAt(idx | 0) || (map = '=', idx % 1);
      // "8 - idx % 1 * 8" generates the sequence 2, 4, 6, 8
      output += map.charAt(63 & block >> 8 - idx % 1 * 8)
    ) {
      charCode = input.charCodeAt(idx += 3/4);
      if (charCode > 0xFF) {
        throw new InvalidCharacterError("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
      }
      block = block << 8 | charCode;
    }
    return output;
  });

  // decoder
  // [https://gist.github.com/1020396] by [https://github.com/atk]
  object.atob || (
  object.atob = function (input) {
    input = input.replace(/=+$/, '');
    if (input.length % 4 == 1) {
      throw new InvalidCharacterError("'atob' failed: The string to be decoded is not correctly encoded.");
    }
    for (
      // initialize result and counters
      var bc = 0, bs, buffer, idx = 0, output = '';
      // get next character
      buffer = input.charAt(idx++);
      // character found in table? initialize bit storage and add its ascii value;
      ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
        // and if not first of each 4 characters,
        // convert the first 8 bits to one ascii character
        bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0
    ) {
      // try to find character in table (0-63, not found => -1)
      buffer = chars.indexOf(buffer);
    }
    return output;
  });

}());

},{}],45:[function(require,module,exports){
var http = require('http');

var https = module.exports;

for (var key in http) {
    if (http.hasOwnProperty(key)) https[key] = http[key];
};

https.request = function (params, cb) {
    if (!params) params = {};
    params.scheme = 'https';
    return http.request.call(this, params, cb);
}

},{"http":41}],46:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],47:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require("lppjwH"))
},{"lppjwH":48}],48:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],49:[function(require,module,exports){
(function (global){
/*! http://mths.be/punycode v1.2.4 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports;
	var freeModule = typeof module == 'object' && module &&
		module.exports == freeExports && module;
	var freeGlobal = typeof global == 'object' && global;
	if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^ -~]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /\x2E|\u3002|\uFF0E|\uFF61/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		while (length--) {
			array[length] = fn(array[length]);
		}
		return array;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings.
	 * @private
	 * @param {String} domain The domain name.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		return map(string.split(regexSeparators), fn).join('.');
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <http://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * http://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols to a Punycode string of ASCII-only
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name to Unicode. Only the
	 * Punycoded parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it on a string that has already been converted to
	 * Unicode.
	 * @memberOf punycode
	 * @param {String} domain The Punycode domain name to convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(domain) {
		return mapDomain(domain, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name to Punycode. Only the
	 * non-ASCII parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it with a domain that's already in ASCII.
	 * @memberOf punycode
	 * @param {String} domain The domain name to convert, as a Unicode string.
	 * @returns {String} The Punycode representation of the given domain name.
	 */
	function toASCII(domain) {
		return mapDomain(domain, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.2.4',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <http://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && !freeExports.nodeType) {
		if (freeModule) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else { // in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],50:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],51:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],52:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":50,"./encode":51}],53:[function(require,module,exports){
module.exports = require("./lib/_stream_duplex.js")

},{"./lib/_stream_duplex.js":54}],54:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.

module.exports = Duplex;

/*<replacement>*/
var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) keys.push(key);
  return keys;
}
/*</replacement>*/


/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var Readable = require('./_stream_readable');
var Writable = require('./_stream_writable');

util.inherits(Duplex, Readable);

forEach(objectKeys(Writable.prototype), function(method) {
  if (!Duplex.prototype[method])
    Duplex.prototype[method] = Writable.prototype[method];
});

function Duplex(options) {
  if (!(this instanceof Duplex))
    return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false)
    this.readable = false;

  if (options && options.writable === false)
    this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false)
    this.allowHalfOpen = false;

  this.once('end', onend);
}

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended)
    return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  process.nextTick(this.end.bind(this));
}

function forEach (xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

}).call(this,require("lppjwH"))
},{"./_stream_readable":56,"./_stream_writable":58,"core-util-is":59,"inherits":46,"lppjwH":48}],55:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.

module.exports = PassThrough;

var Transform = require('./_stream_transform');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough))
    return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function(chunk, encoding, cb) {
  cb(null, chunk);
};

},{"./_stream_transform":57,"core-util-is":59,"inherits":46}],56:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Readable;

/*<replacement>*/
var isArray = require('isarray');
/*</replacement>*/


/*<replacement>*/
var Buffer = require('buffer').Buffer;
/*</replacement>*/

Readable.ReadableState = ReadableState;

var EE = require('events').EventEmitter;

/*<replacement>*/
if (!EE.listenerCount) EE.listenerCount = function(emitter, type) {
  return emitter.listeners(type).length;
};
/*</replacement>*/

var Stream = require('stream');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var StringDecoder;

util.inherits(Readable, Stream);

function ReadableState(options, stream) {
  options = options || {};

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : 16 * 1024;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.buffer = [];
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = false;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // In streams that never have any data, and do push(null) right away,
  // the consumer can miss the 'end' event if they do some I/O before
  // consuming the stream.  So, we don't emit('end') until some reading
  // happens.
  this.calledRead = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, becuase any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;


  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // when piping, we only care about 'readable' events that happen
  // after read()ing all the bytes and not getting any pushback.
  this.ranOut = false;

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    if (!StringDecoder)
      StringDecoder = require('string_decoder/').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  if (!(this instanceof Readable))
    return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  Stream.call(this);
}

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function(chunk, encoding) {
  var state = this._readableState;

  if (typeof chunk === 'string' && !state.objectMode) {
    encoding = encoding || state.defaultEncoding;
    if (encoding !== state.encoding) {
      chunk = new Buffer(chunk, encoding);
      encoding = '';
    }
  }

  return readableAddChunk(this, state, chunk, encoding, false);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function(chunk) {
  var state = this._readableState;
  return readableAddChunk(this, state, chunk, '', true);
};

function readableAddChunk(stream, state, chunk, encoding, addToFront) {
  var er = chunkInvalid(state, chunk);
  if (er) {
    stream.emit('error', er);
  } else if (chunk === null || chunk === undefined) {
    state.reading = false;
    if (!state.ended)
      onEofChunk(stream, state);
  } else if (state.objectMode || chunk && chunk.length > 0) {
    if (state.ended && !addToFront) {
      var e = new Error('stream.push() after EOF');
      stream.emit('error', e);
    } else if (state.endEmitted && addToFront) {
      var e = new Error('stream.unshift() after end event');
      stream.emit('error', e);
    } else {
      if (state.decoder && !addToFront && !encoding)
        chunk = state.decoder.write(chunk);

      // update the buffer info.
      state.length += state.objectMode ? 1 : chunk.length;
      if (addToFront) {
        state.buffer.unshift(chunk);
      } else {
        state.reading = false;
        state.buffer.push(chunk);
      }

      if (state.needReadable)
        emitReadable(stream);

      maybeReadMore(stream, state);
    }
  } else if (!addToFront) {
    state.reading = false;
  }

  return needMoreData(state);
}



// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended &&
         (state.needReadable ||
          state.length < state.highWaterMark ||
          state.length === 0);
}

// backwards compatibility.
Readable.prototype.setEncoding = function(enc) {
  if (!StringDecoder)
    StringDecoder = require('string_decoder/').StringDecoder;
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
};

// Don't raise the hwm > 128MB
var MAX_HWM = 0x800000;
function roundUpToNextPowerOf2(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2
    n--;
    for (var p = 1; p < 32; p <<= 1) n |= n >> p;
    n++;
  }
  return n;
}

function howMuchToRead(n, state) {
  if (state.length === 0 && state.ended)
    return 0;

  if (state.objectMode)
    return n === 0 ? 0 : 1;

  if (isNaN(n) || n === null) {
    // only flow one buffer at a time
    if (state.flowing && state.buffer.length)
      return state.buffer[0].length;
    else
      return state.length;
  }

  if (n <= 0)
    return 0;

  // If we're asking for more than the target buffer level,
  // then raise the water mark.  Bump up to the next highest
  // power of 2, to prevent increasing it excessively in tiny
  // amounts.
  if (n > state.highWaterMark)
    state.highWaterMark = roundUpToNextPowerOf2(n);

  // don't have that much.  return null, unless we've ended.
  if (n > state.length) {
    if (!state.ended) {
      state.needReadable = true;
      return 0;
    } else
      return state.length;
  }

  return n;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function(n) {
  var state = this._readableState;
  state.calledRead = true;
  var nOrig = n;

  if (typeof n !== 'number' || n > 0)
    state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 &&
      state.needReadable &&
      (state.length >= state.highWaterMark || state.ended)) {
    emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0)
      endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;

  // if we currently have less than the highWaterMark, then also read some
  if (state.length - n <= state.highWaterMark)
    doRead = true;

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading)
    doRead = false;

  if (doRead) {
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0)
      state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
  }

  // If _read called its callback synchronously, then `reading`
  // will be false, and we need to re-evaluate how much data we
  // can return to the user.
  if (doRead && !state.reading)
    n = howMuchToRead(nOrig, state);

  var ret;
  if (n > 0)
    ret = fromList(n, state);
  else
    ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  }

  state.length -= n;

  // If we have nothing in the buffer, then we want to know
  // as soon as we *do* get something into the buffer.
  if (state.length === 0 && !state.ended)
    state.needReadable = true;

  // If we happened to read() exactly the remaining amount in the
  // buffer, and the EOF has been seen at this point, then make sure
  // that we emit 'end' on the very next tick.
  if (state.ended && !state.endEmitted && state.length === 0)
    endReadable(this);

  return ret;
};

function chunkInvalid(state, chunk) {
  var er = null;
  if (!Buffer.isBuffer(chunk) &&
      'string' !== typeof chunk &&
      chunk !== null &&
      chunk !== undefined &&
      !state.objectMode &&
      !er) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}


function onEofChunk(stream, state) {
  if (state.decoder && !state.ended) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // if we've ended and we have some data left, then emit
  // 'readable' now to make sure it gets picked up.
  if (state.length > 0)
    emitReadable(stream);
  else
    endReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (state.emittedReadable)
    return;

  state.emittedReadable = true;
  if (state.sync)
    process.nextTick(function() {
      emitReadable_(stream);
    });
  else
    emitReadable_(stream);
}

function emitReadable_(stream) {
  stream.emit('readable');
}


// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    process.nextTick(function() {
      maybeReadMore_(stream, state);
    });
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended &&
         state.length < state.highWaterMark) {
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;
    else
      len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function(n) {
  this.emit('error', new Error('not implemented'));
};

Readable.prototype.pipe = function(dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;

  var doEnd = (!pipeOpts || pipeOpts.end !== false) &&
              dest !== process.stdout &&
              dest !== process.stderr;

  var endFn = doEnd ? onend : cleanup;
  if (state.endEmitted)
    process.nextTick(endFn);
  else
    src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable) {
    if (readable !== src) return;
    cleanup();
  }

  function onend() {
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  function cleanup() {
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', cleanup);

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (!dest._writableState || dest._writableState.needDrain)
      ondrain();
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  function onerror(er) {
    unpipe();
    dest.removeListener('error', onerror);
    if (EE.listenerCount(dest, 'error') === 0)
      dest.emit('error', er);
  }
  // This is a brutally ugly hack to make sure that our error handler
  // is attached before any userland ones.  NEVER DO THIS.
  if (!dest._events || !dest._events.error)
    dest.on('error', onerror);
  else if (isArray(dest._events.error))
    dest._events.error.unshift(onerror);
  else
    dest._events.error = [onerror, dest._events.error];



  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    // the handler that waits for readable events after all
    // the data gets sucked out in flow.
    // This would be easier to follow with a .once() handler
    // in flow(), but that is too slow.
    this.on('readable', pipeOnReadable);

    state.flowing = true;
    process.nextTick(function() {
      flow(src);
    });
  }

  return dest;
};

function pipeOnDrain(src) {
  return function() {
    var dest = this;
    var state = src._readableState;
    state.awaitDrain--;
    if (state.awaitDrain === 0)
      flow(src);
  };
}

function flow(src) {
  var state = src._readableState;
  var chunk;
  state.awaitDrain = 0;

  function write(dest, i, list) {
    var written = dest.write(chunk);
    if (false === written) {
      state.awaitDrain++;
    }
  }

  while (state.pipesCount && null !== (chunk = src.read())) {

    if (state.pipesCount === 1)
      write(state.pipes, 0, null);
    else
      forEach(state.pipes, write);

    src.emit('data', chunk);

    // if anyone needs a drain, then we have to wait for that.
    if (state.awaitDrain > 0)
      return;
  }

  // if every destination was unpiped, either before entering this
  // function, or in the while loop, then stop flowing.
  //
  // NB: This is a pretty rare edge case.
  if (state.pipesCount === 0) {
    state.flowing = false;

    // if there were data event listeners added, then switch to old mode.
    if (EE.listenerCount(src, 'data') > 0)
      emitDataEvents(src);
    return;
  }

  // at this point, no one needed a drain, so we just ran out of data
  // on the next readable event, start it over again.
  state.ranOut = true;
}

function pipeOnReadable() {
  if (this._readableState.ranOut) {
    this._readableState.ranOut = false;
    flow(this);
  }
}


Readable.prototype.unpipe = function(dest) {
  var state = this._readableState;

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0)
    return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes)
      return this;

    if (!dest)
      dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    this.removeListener('readable', pipeOnReadable);
    state.flowing = false;
    if (dest)
      dest.emit('unpipe', this);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    this.removeListener('readable', pipeOnReadable);
    state.flowing = false;

    for (var i = 0; i < len; i++)
      dests[i].emit('unpipe', this);
    return this;
  }

  // try to find the right one.
  var i = indexOf(state.pipes, dest);
  if (i === -1)
    return this;

  state.pipes.splice(i, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1)
    state.pipes = state.pipes[0];

  dest.emit('unpipe', this);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function(ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);

  if (ev === 'data' && !this._readableState.flowing)
    emitDataEvents(this);

  if (ev === 'readable' && this.readable) {
    var state = this._readableState;
    if (!state.readableListening) {
      state.readableListening = true;
      state.emittedReadable = false;
      state.needReadable = true;
      if (!state.reading) {
        this.read(0);
      } else if (state.length) {
        emitReadable(this, state);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function() {
  emitDataEvents(this);
  this.read(0);
  this.emit('resume');
};

Readable.prototype.pause = function() {
  emitDataEvents(this, true);
  this.emit('pause');
};

function emitDataEvents(stream, startPaused) {
  var state = stream._readableState;

  if (state.flowing) {
    // https://github.com/isaacs/readable-stream/issues/16
    throw new Error('Cannot switch to old mode now.');
  }

  var paused = startPaused || false;
  var readable = false;

  // convert to an old-style stream.
  stream.readable = true;
  stream.pipe = Stream.prototype.pipe;
  stream.on = stream.addListener = Stream.prototype.on;

  stream.on('readable', function() {
    readable = true;

    var c;
    while (!paused && (null !== (c = stream.read())))
      stream.emit('data', c);

    if (c === null) {
      readable = false;
      stream._readableState.needReadable = true;
    }
  });

  stream.pause = function() {
    paused = true;
    this.emit('pause');
  };

  stream.resume = function() {
    paused = false;
    if (readable)
      process.nextTick(function() {
        stream.emit('readable');
      });
    else
      this.read(0);
    this.emit('resume');
  };

  // now make it start, just in case it hadn't already.
  stream.emit('readable');
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function(stream) {
  var state = this._readableState;
  var paused = false;

  var self = this;
  stream.on('end', function() {
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length)
        self.push(chunk);
    }

    self.push(null);
  });

  stream.on('data', function(chunk) {
    if (state.decoder)
      chunk = state.decoder.write(chunk);
    if (!chunk || !state.objectMode && !chunk.length)
      return;

    var ret = self.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (typeof stream[i] === 'function' &&
        typeof this[i] === 'undefined') {
      this[i] = function(method) { return function() {
        return stream[method].apply(stream, arguments);
      }}(i);
    }
  }

  // proxy certain important events.
  var events = ['error', 'close', 'destroy', 'pause', 'resume'];
  forEach(events, function(ev) {
    stream.on(ev, self.emit.bind(self, ev));
  });

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  self._read = function(n) {
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return self;
};



// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
function fromList(n, state) {
  var list = state.buffer;
  var length = state.length;
  var stringMode = !!state.decoder;
  var objectMode = !!state.objectMode;
  var ret;

  // nothing in the list, definitely empty.
  if (list.length === 0)
    return null;

  if (length === 0)
    ret = null;
  else if (objectMode)
    ret = list.shift();
  else if (!n || n >= length) {
    // read it all, truncate the array.
    if (stringMode)
      ret = list.join('');
    else
      ret = Buffer.concat(list, length);
    list.length = 0;
  } else {
    // read just some of it.
    if (n < list[0].length) {
      // just take a part of the first list item.
      // slice is the same for buffers and strings.
      var buf = list[0];
      ret = buf.slice(0, n);
      list[0] = buf.slice(n);
    } else if (n === list[0].length) {
      // first list is a perfect match
      ret = list.shift();
    } else {
      // complex case.
      // we have enough to cover it, but it spans past the first buffer.
      if (stringMode)
        ret = '';
      else
        ret = new Buffer(n);

      var c = 0;
      for (var i = 0, l = list.length; i < l && c < n; i++) {
        var buf = list[0];
        var cpy = Math.min(n - c, buf.length);

        if (stringMode)
          ret += buf.slice(0, cpy);
        else
          buf.copy(ret, c, 0, cpy);

        if (cpy < buf.length)
          list[0] = buf.slice(cpy);
        else
          list.shift();

        c += cpy;
      }
    }
  }

  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0)
    throw new Error('endReadable called on non-empty stream');

  if (!state.endEmitted && state.calledRead) {
    state.ended = true;
    process.nextTick(function() {
      // Check that we didn't get one last unshift.
      if (!state.endEmitted && state.length === 0) {
        state.endEmitted = true;
        stream.readable = false;
        stream.emit('end');
      }
    });
  }
}

function forEach (xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

function indexOf (xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}

}).call(this,require("lppjwH"))
},{"buffer":37,"core-util-is":59,"events":40,"inherits":46,"isarray":60,"lppjwH":48,"stream":66,"string_decoder/":61}],57:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.


// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

module.exports = Transform;

var Duplex = require('./_stream_duplex');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(Transform, Duplex);


function TransformState(options, stream) {
  this.afterTransform = function(er, data) {
    return afterTransform(stream, er, data);
  };

  this.needTransform = false;
  this.transforming = false;
  this.writecb = null;
  this.writechunk = null;
}

function afterTransform(stream, er, data) {
  var ts = stream._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb)
    return stream.emit('error', new Error('no writecb in Transform class'));

  ts.writechunk = null;
  ts.writecb = null;

  if (data !== null && data !== undefined)
    stream.push(data);

  if (cb)
    cb(er);

  var rs = stream._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    stream._read(rs.highWaterMark);
  }
}


function Transform(options) {
  if (!(this instanceof Transform))
    return new Transform(options);

  Duplex.call(this, options);

  var ts = this._transformState = new TransformState(options, this);

  // when the writable side finishes, then flush out anything remaining.
  var stream = this;

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  this.once('finish', function() {
    if ('function' === typeof this._flush)
      this._flush(function(er) {
        done(stream, er);
      });
    else
      done(stream);
  });
}

Transform.prototype.push = function(chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function(chunk, encoding, cb) {
  throw new Error('not implemented');
};

Transform.prototype._write = function(chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform ||
        rs.needReadable ||
        rs.length < rs.highWaterMark)
      this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function(n) {
  var ts = this._transformState;

  if (ts.writechunk !== null && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};


function done(stream, er) {
  if (er)
    return stream.emit('error', er);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  var ws = stream._writableState;
  var rs = stream._readableState;
  var ts = stream._transformState;

  if (ws.length)
    throw new Error('calling transform done when ws.length != 0');

  if (ts.transforming)
    throw new Error('calling transform done when still transforming');

  return stream.push(null);
}

},{"./_stream_duplex":54,"core-util-is":59,"inherits":46}],58:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// A bit simpler than readable streams.
// Implement an async ._write(chunk, cb), and it'll handle all
// the drain event emission and buffering.

module.exports = Writable;

/*<replacement>*/
var Buffer = require('buffer').Buffer;
/*</replacement>*/

Writable.WritableState = WritableState;


/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/


var Stream = require('stream');

util.inherits(Writable, Stream);

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
}

function WritableState(options, stream) {
  options = options || {};

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : 16 * 1024;

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, becuase any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function(er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.buffer = [];

  // True if the error was already emitted and should not be thrown again
  this.errorEmitted = false;
}

function Writable(options) {
  var Duplex = require('./_stream_duplex');

  // Writable ctor is applied to Duplexes, though they're not
  // instanceof Writable, they're instanceof Readable.
  if (!(this instanceof Writable) && !(this instanceof Duplex))
    return new Writable(options);

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  Stream.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function() {
  this.emit('error', new Error('Cannot pipe. Not readable.'));
};


function writeAfterEnd(stream, state, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  process.nextTick(function() {
    cb(er);
  });
}

// If we get something that is not a buffer, string, null, or undefined,
// and we're not in objectMode, then that's an error.
// Otherwise stream chunks are all considered to be of length=1, and the
// watermarks determine how many objects to keep in the buffer, rather than
// how many bytes or characters.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  if (!Buffer.isBuffer(chunk) &&
      'string' !== typeof chunk &&
      chunk !== null &&
      chunk !== undefined &&
      !state.objectMode) {
    var er = new TypeError('Invalid non-string/buffer chunk');
    stream.emit('error', er);
    process.nextTick(function() {
      cb(er);
    });
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function(chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (Buffer.isBuffer(chunk))
    encoding = 'buffer';
  else if (!encoding)
    encoding = state.defaultEncoding;

  if (typeof cb !== 'function')
    cb = function() {};

  if (state.ended)
    writeAfterEnd(this, state, cb);
  else if (validChunk(this, state, chunk, cb))
    ret = writeOrBuffer(this, state, chunk, encoding, cb);

  return ret;
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode &&
      state.decodeStrings !== false &&
      typeof chunk === 'string') {
    chunk = new Buffer(chunk, encoding);
  }
  return chunk;
}

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, chunk, encoding, cb) {
  chunk = decodeChunk(state, chunk, encoding);
  if (Buffer.isBuffer(chunk))
    encoding = 'buffer';
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  // we must ensure that previous needDrain will not be reset to false.
  if (!ret)
    state.needDrain = true;

  if (state.writing)
    state.buffer.push(new WriteReq(chunk, encoding, cb));
  else
    doWrite(stream, state, len, chunk, encoding, cb);

  return ret;
}

function doWrite(stream, state, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  if (sync)
    process.nextTick(function() {
      cb(er);
    });
  else
    cb(er);

  stream._writableState.errorEmitted = true;
  stream.emit('error', er);
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er)
    onwriteError(stream, state, sync, er, cb);
  else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(stream, state);

    if (!finished && !state.bufferProcessing && state.buffer.length)
      clearBuffer(stream, state);

    if (sync) {
      process.nextTick(function() {
        afterWrite(stream, state, finished, cb);
      });
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished)
    onwriteDrain(stream, state);
  cb();
  if (finished)
    finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}


// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;

  for (var c = 0; c < state.buffer.length; c++) {
    var entry = state.buffer[c];
    var chunk = entry.chunk;
    var encoding = entry.encoding;
    var cb = entry.callback;
    var len = state.objectMode ? 1 : chunk.length;

    doWrite(stream, state, len, chunk, encoding, cb);

    // if we didn't call the onwrite immediately, then
    // it means that we need to wait until it does.
    // also, that means that the chunk and cb are currently
    // being processed, so move the buffer counter past them.
    if (state.writing) {
      c++;
      break;
    }
  }

  state.bufferProcessing = false;
  if (c < state.buffer.length)
    state.buffer = state.buffer.slice(c);
  else
    state.buffer.length = 0;
}

Writable.prototype._write = function(chunk, encoding, cb) {
  cb(new Error('not implemented'));
};

Writable.prototype.end = function(chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (typeof chunk !== 'undefined' && chunk !== null)
    this.write(chunk, encoding);

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished)
    endWritable(this, state, cb);
};


function needFinish(stream, state) {
  return (state.ending &&
          state.length === 0 &&
          !state.finished &&
          !state.writing);
}

function finishMaybe(stream, state) {
  var need = needFinish(stream, state);
  if (need) {
    state.finished = true;
    stream.emit('finish');
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished)
      process.nextTick(cb);
    else
      stream.once('finish', cb);
  }
  state.ended = true;
}

}).call(this,require("lppjwH"))
},{"./_stream_duplex":54,"buffer":37,"core-util-is":59,"inherits":46,"lppjwH":48,"stream":66}],59:[function(require,module,exports){
(function (Buffer){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

function isBuffer(arg) {
  return Buffer.isBuffer(arg);
}
exports.isBuffer = isBuffer;

function objectToString(o) {
  return Object.prototype.toString.call(o);
}
}).call(this,require("buffer").Buffer)
},{"buffer":37}],60:[function(require,module,exports){
module.exports = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

},{}],61:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var Buffer = require('buffer').Buffer;

var isBufferEncoding = Buffer.isEncoding
  || function(encoding) {
       switch (encoding && encoding.toLowerCase()) {
         case 'hex': case 'utf8': case 'utf-8': case 'ascii': case 'binary': case 'base64': case 'ucs2': case 'ucs-2': case 'utf16le': case 'utf-16le': case 'raw': return true;
         default: return false;
       }
     }


function assertEncoding(encoding) {
  if (encoding && !isBufferEncoding(encoding)) {
    throw new Error('Unknown encoding: ' + encoding);
  }
}

var StringDecoder = exports.StringDecoder = function(encoding) {
  this.encoding = (encoding || 'utf8').toLowerCase().replace(/[-_]/, '');
  assertEncoding(encoding);
  switch (this.encoding) {
    case 'utf8':
      // CESU-8 represents each of Surrogate Pair by 3-bytes
      this.surrogateSize = 3;
      break;
    case 'ucs2':
    case 'utf16le':
      // UTF-16 represents each of Surrogate Pair by 2-bytes
      this.surrogateSize = 2;
      this.detectIncompleteChar = utf16DetectIncompleteChar;
      break;
    case 'base64':
      // Base-64 stores 3 bytes in 4 chars, and pads the remainder.
      this.surrogateSize = 3;
      this.detectIncompleteChar = base64DetectIncompleteChar;
      break;
    default:
      this.write = passThroughWrite;
      return;
  }

  this.charBuffer = new Buffer(6);
  this.charReceived = 0;
  this.charLength = 0;
};


StringDecoder.prototype.write = function(buffer) {
  var charStr = '';
  var offset = 0;

  // if our last write ended with an incomplete multibyte character
  while (this.charLength) {
    // determine how many remaining bytes this buffer has to offer for this char
    var i = (buffer.length >= this.charLength - this.charReceived) ?
                this.charLength - this.charReceived :
                buffer.length;

    // add the new bytes to the char buffer
    buffer.copy(this.charBuffer, this.charReceived, offset, i);
    this.charReceived += (i - offset);
    offset = i;

    if (this.charReceived < this.charLength) {
      // still not enough chars in this buffer? wait for more ...
      return '';
    }

    // get the character that was split
    charStr = this.charBuffer.slice(0, this.charLength).toString(this.encoding);

    // lead surrogate (D800-DBFF) is also the incomplete character
    var charCode = charStr.charCodeAt(charStr.length - 1);
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      this.charLength += this.surrogateSize;
      charStr = '';
      continue;
    }
    this.charReceived = this.charLength = 0;

    // if there are no more bytes in this buffer, just emit our char
    if (i == buffer.length) return charStr;

    // otherwise cut off the characters end from the beginning of this buffer
    buffer = buffer.slice(i, buffer.length);
    break;
  }

  var lenIncomplete = this.detectIncompleteChar(buffer);

  var end = buffer.length;
  if (this.charLength) {
    // buffer the incomplete character bytes we got
    buffer.copy(this.charBuffer, 0, buffer.length - lenIncomplete, end);
    this.charReceived = lenIncomplete;
    end -= lenIncomplete;
  }

  charStr += buffer.toString(this.encoding, 0, end);

  var end = charStr.length - 1;
  var charCode = charStr.charCodeAt(end);
  // lead surrogate (D800-DBFF) is also the incomplete character
  if (charCode >= 0xD800 && charCode <= 0xDBFF) {
    var size = this.surrogateSize;
    this.charLength += size;
    this.charReceived += size;
    this.charBuffer.copy(this.charBuffer, size, 0, size);
    this.charBuffer.write(charStr.charAt(charStr.length - 1), this.encoding);
    return charStr.substring(0, end);
  }

  // or just emit the charStr
  return charStr;
};

StringDecoder.prototype.detectIncompleteChar = function(buffer) {
  // determine how many bytes we have to check at the end of this buffer
  var i = (buffer.length >= 3) ? 3 : buffer.length;

  // Figure out if one of the last i bytes of our buffer announces an
  // incomplete char.
  for (; i > 0; i--) {
    var c = buffer[buffer.length - i];

    // See http://en.wikipedia.org/wiki/UTF-8#Description

    // 110XXXXX
    if (i == 1 && c >> 5 == 0x06) {
      this.charLength = 2;
      break;
    }

    // 1110XXXX
    if (i <= 2 && c >> 4 == 0x0E) {
      this.charLength = 3;
      break;
    }

    // 11110XXX
    if (i <= 3 && c >> 3 == 0x1E) {
      this.charLength = 4;
      break;
    }
  }

  return i;
};

StringDecoder.prototype.end = function(buffer) {
  var res = '';
  if (buffer && buffer.length)
    res = this.write(buffer);

  if (this.charReceived) {
    var cr = this.charReceived;
    var buf = this.charBuffer;
    var enc = this.encoding;
    res += buf.slice(0, cr).toString(enc);
  }

  return res;
};

function passThroughWrite(buffer) {
  return buffer.toString(this.encoding);
}

function utf16DetectIncompleteChar(buffer) {
  var incomplete = this.charReceived = buffer.length % 2;
  this.charLength = incomplete ? 2 : 0;
  return incomplete;
}

function base64DetectIncompleteChar(buffer) {
  var incomplete = this.charReceived = buffer.length % 3;
  this.charLength = incomplete ? 3 : 0;
  return incomplete;
}

},{"buffer":37}],62:[function(require,module,exports){
module.exports = require("./lib/_stream_passthrough.js")

},{"./lib/_stream_passthrough.js":55}],63:[function(require,module,exports){
exports = module.exports = require('./lib/_stream_readable.js');
exports.Readable = exports;
exports.Writable = require('./lib/_stream_writable.js');
exports.Duplex = require('./lib/_stream_duplex.js');
exports.Transform = require('./lib/_stream_transform.js');
exports.PassThrough = require('./lib/_stream_passthrough.js');

},{"./lib/_stream_duplex.js":54,"./lib/_stream_passthrough.js":55,"./lib/_stream_readable.js":56,"./lib/_stream_transform.js":57,"./lib/_stream_writable.js":58}],64:[function(require,module,exports){
module.exports = require("./lib/_stream_transform.js")

},{"./lib/_stream_transform.js":57}],65:[function(require,module,exports){
module.exports = require("./lib/_stream_writable.js")

},{"./lib/_stream_writable.js":58}],66:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Stream;

var EE = require('events').EventEmitter;
var inherits = require('inherits');

inherits(Stream, EE);
Stream.Readable = require('readable-stream/readable.js');
Stream.Writable = require('readable-stream/writable.js');
Stream.Duplex = require('readable-stream/duplex.js');
Stream.Transform = require('readable-stream/transform.js');
Stream.PassThrough = require('readable-stream/passthrough.js');

// Backwards-compat with node 0.4.x
Stream.Stream = Stream;



// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

function Stream() {
  EE.call(this);
}

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
  if (!dest._isStdio && (!options || options.end !== false)) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    if (typeof dest.destroy === 'function') dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (EE.listenerCount(this, 'error') === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

},{"events":40,"inherits":46,"readable-stream/duplex.js":53,"readable-stream/passthrough.js":62,"readable-stream/readable.js":63,"readable-stream/transform.js":64,"readable-stream/writable.js":65}],67:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var punycode = require('punycode');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a puny coded representation of "domain".
      // It only converts the part of the domain name that
      // has non ASCII characters. I.e. it dosent matter if
      // you call it with a domain that already is in ASCII.
      var domainArray = this.hostname.split('.');
      var newOut = [];
      for (var i = 0; i < domainArray.length; ++i) {
        var s = domainArray[i];
        newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
            'xn--' + punycode.encode(s) : s);
      }
      this.hostname = newOut.join('.');
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  Object.keys(this).forEach(function(k) {
    result[k] = this[k];
  }, this);

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    Object.keys(relative).forEach(function(k) {
      if (k !== 'protocol')
        result[k] = relative[k];
    });

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      Object.keys(relative).forEach(function(k) {
        result[k] = relative[k];
      });
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especialy happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!isNull(result.pathname) || !isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host) && (last === '.' || last === '..') ||
      last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last == '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especialy happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!isNull(result.pathname) || !isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

function isString(arg) {
  return typeof arg === "string";
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isNull(arg) {
  return arg === null;
}
function isNullOrUndefined(arg) {
  return  arg == null;
}

},{"punycode":49,"querystring":52}],68:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],69:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require("lppjwH"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":68,"inherits":46,"lppjwH":48}]},{},[35])