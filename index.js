var express = require('express')
var mongoose   = require('mongoose');
var ObjectID = require('mongodb').ObjectID
var query2m = require('query-to-mongo')
var bodyParser = require('body-parser')
var inflector = require('inflection')

module.exports = {
  autoRemoveReqToFind: (Schema) => {
    Schema.pre('find',  function(next) {
      let query = this.getQuery();
      if (!!query._req)
        delete query._req
      next();
    });
    Schema.pre('count', function(next) {
      let query = this.getQuery();
      if (!!query._req)
        delete query._req
      next();
    });

    return Schema;
  },

  router: (options) => {
    let router

    options = options || {}

    router = express.Router()

    router.use(bodyParser.json())
    router.use(function (req, res, next) {
        res.envelope = options.envelope
        next()
    })

    if (options.validator) router.use(options.validator)

    addRestMethods(router, options.singularize || inflector.singularize, !!options.reqtofind)
    router.use('/:collection', envelope)
    router.use('/:collection', sendJson)
    return router
  }
}

function isEmpty(obj) {
    if (obj == null || obj.length === 0) return true
    if (obj.length > 0) return false
    for (let key in obj) {
        if (obj.hasOwnProperty(key)) return false
    }
    return true
}

function fullUrl(req) {
    return req.protocol + '://' + req.get('host') + req.originalUrl
}

function normalizeId(id) {
    if (ObjectID.isValid(id)) return new ObjectID(id)
    return id;
}

function addRestMethods(router, singularize, reqtofind) {
    router.param('collection', function collectionParam(req, res, next, collection) {
        res.locals.plural = collection
        res.locals.singular = singularize(collection)
        res.locals.collectionName = res.locals.singular
          .split("_")
          .map(function(word){ return word.charAt(0).toUpperCase() + word.slice(1); })
          .join("");

        req.collectionClass = mongoose.model(res.locals.collectionName);
        next()
    })

    router.param('id', function (req, res, next, id) {
        req.idMatch = { _id: normalizeId(id) }
        next()
    })

    /*if (reqtofind) {
      let autoremove = {};
      router.param('collection', function collectionParam(req, res, next, collection) {
          if (autoremove[res.locals.singular] === undefined && req.collectionClass) {
            autoremove[res.locals.singular] = true;
            autoRemoveReqToFind(req.collectionClass.schema);
          }
          next();
      });
    }*/

    router.get('/:collection/count', function (req, res, next) {
        let query = query2m(req.query, { ignore: 'envelope', ignore: 'populate' })
        if (reqtofind)
          query.criteria._req = req;

        req.collectionClass.count(query.criteria, function (e, count) {
            if (e) return res.status(400).json(e)

            res.json({count: count})
        })
    })

    router.get('/:collection', function (req, res, next) {
        let populate = req.query.populate||'';
        let query = query2m(req.query, { ignore: ['envelope', 'populate'] })
        if (reqtofind)
          query.criteria._req = req;

        req.collectionClass.count(query.criteria, function (e, count) {
            // let links
            if (e) return res.status(400).json(e)
            res.append('X-Total-Count', count)
            let find = req.collectionClass.find(query.criteria)
            populate.split(',').forEach(value => {
              [path, nextpopulate] = value.trim().split('.');

              let _populate = { path: path.trim().replace('->','.') }
              if (nextpopulate)
                _populate.populate = { path: nextpopulate };
              find.populate(_populate);
            })
            Object.entries(query.options).forEach(([key, value]) => {
              switch (key) {
                case 'sort':
                  find.sort(value);
                  break;
                case 'limit':
                  find.limit(value);
                  break;
                case 'offset':
                case 'skip':
                  find.skip(value);
                  break;
                case 'fields':
                case 'select':
                  find.select(value);
                  break;
                default:

              }
            })
            find.exec(function (e, results) {
                if (e) return res.status(400).json(e)
                res.locals.json = results
                next()
            })
        })
    })

    router.post('/:collection', function (req, res, next) {
        if (!req.body || isEmpty(req.body)) throw { status: 400, message: 'No Request Body' } // Bad Request
        let obj = new req.collectionClass(req.body);

        obj.save(function (e, doc) {
            if (e) return res.status(400).json(e)
            res.status(201) // Created

            let populate = req.query.populate||'';
            if (populate.trim().length) {
              populate.split(',').forEach(value => {
                [path, nextpopulate] = value.trim().split('.');

                let _populate = { path: path.trim().replace('->','.') }
                if (nextpopulate)
                  _populate.populate = { path: nextpopulate };
                doc.populate(_populate);
              })
              doc
                .execPopulate()
                .then(doc => {
                  res.locals.json = doc
                  next()
                });
            } else {
              res.locals.json = doc
              next()
            }
        })
    })

    router.put('/:collection', function (req, res, next) {
        res.status(405).send({method_not_allowed:true})
    })

    router.patch('/:collection', function (req, res, next) {
        res.status(405).send({method_not_allowed:true})
    })

    router.delete('/:collection', function (req, res, next) {
        res.status(405).send({method_not_allowed:true})
    })

    router.get('/:collection/:id', function (req, res, next) {

        let find = req.collectionClass.findOne(req.idMatch);

        let populate = req.query.populate||'';
        populate.split(',').forEach(value => {
          [path, nextpopulate] = value.trim().split('.');

          let _populate = { path: path.trim().replace('->','.') }
          if (nextpopulate)
            _populate.populate = { path: nextpopulate };
          find.populate(_populate);
        })

        find.exec(function (e, result) {
            if (e) return res.status(400).json(e)
            if (!result) res.status(404) // Not Found
            res.locals.json = result
            next()
        })
    })

    router.post('/:collection/:id', function (req, res, next) {
        res.status(405).send({method_not_allowed:true})
    })

    router.put('/:collection/:id', function (req, res, next) {
        if (!req.body || isEmpty(req.body)) throw { status: 400, message: 'No Request Body' } // Bad Request
        req.body._id = normalizeId(req.params.id)

        req.collectionClass.findById(req.body._id, function (e, result) {
          if (e) return res.status(400).json(e);
          if (!result) return res.status(400).json({errors: {}, message: 'Document not found' });

          result.set(req.body);
          result.save(function (e, result) {
            if (e) return res.status(400).json(e);

            let populate = req.query.populate||'';
            if (populate.trim().length) {
              populate.split(',').forEach(value => {
                [path, nextpopulate] = value.trim().split('.');

                let _populate = { path: path.trim().replace('->','.') }
                if (nextpopulate)
                  _populate.populate = { path: nextpopulate };
                result.populate(_populate);
              })
              result
                .populate(populate.split(","))
                .execPopulate()
                .then(doc => {
                  res.locals.json = doc
                  next()
                });
            } else {
              res.locals.json = result
              next()
            }
          });
        });
    })

    router.patch('/:collection/:id', function (req, res, next) {
        if (!req.body || isEmpty(req.body)) throw { status: 400, message: 'No Request Body' } // Bad Request
        req.body._id = normalizeId(req.params.id)

        req.collectionClass.findByIdAndUpdate(req.body._id, { $set: req.body }, { new: true }, function (e, result) {
          if (e) return res.status(400).json(e)

          res.locals.json = result
          next()
        });
    })

    router.delete('/:collection/:id', function (req, res, next) {
      req.collectionClass.findOne(req.idMatch, function (e, result) {
          if (e) return res.status(400).json(e)
          if (!result) res.status(404).send({not_found:true})
          else if (!!result.delete)
            result.delete(function (e, result) {
                if (e) return res.status(400).json(e)
                res.status(204).send(); // No Content
            })
          else
            result.remove(function (e, result) {
                if (e) return res.status(400).json(e)
                res.status(204).send(); // No Content
            })
      })
    })

    // TODO: sub-resources (ie., get/post on /:collection/:id/resource)

    return router
}

function isToggled(value, override) {
    return (override && override === String(!value))
}

function envelope(req, res, next) {
    let useEnvelope = res.envelope
    if (isToggled(useEnvelope, req.query['envelope'])) useEnvelope = !useEnvelope

    if (useEnvelope && res.locals.json) {
        let envelope = {}
        let type = res.locals.singular
        if (res.locals.json instanceof Array) type = res.locals.plural
        envelope[type] = res.locals.json
        res.locals.json = envelope
    }
    next()
}

function sendJson(req, res, next) {
    if (res.locals.json) res.send(res.locals.json)
    else next()
}
