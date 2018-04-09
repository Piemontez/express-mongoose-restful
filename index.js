/*
http://www.nightmarejs.org/
*/

var express = require('express')
var mongoose   = require('mongoose');
var ObjectID = require('mongodb').ObjectID
var query2m = require('query-to-mongo')
var bodyParser = require('body-parser')
var inflector = require('inflection')

module.exports = function expressMongooseRestful(options) {
    let router

    options = options || {}

    router = express.Router()

    router.use(bodyParser.json())
    router.use(function (req, res, next) {
        res.envelope = options.envelope
        next()
    })

    if (options.validator) router.use(options.validator)

    addRestMethods(router, options.singularize || inflector.singularize)
    router.use('/:collection', convertId)
    router.use('/:collection', envelope)
    router.use('/:collection', sendJson)
    return router
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

function addRestMethods(router, singularize) {
    router.param('collection', function collectionParam(req, res, next, collection) {
        res.locals.plural = collection
        res.locals.singular = singularize(collection)

        req.collectionClass = mongoose.model(res.locals.plural[0].toUpperCase() + res.locals.plural.slice(1, -1));
        next()
    })

    router.param('id', function (req, res, next, id) {
        req.idMatch = { _id: normalizeId(id) }
        next()
    })

    router.get('/:collection', function (req, res, next) {
        let populate = req.query.populate||'';
        let query = query2m(req.query, { ignore: 'envelope', ignore: 'populate' })

        req.collectionClass.count(query.criteria, function (e, count) {
            // let links
            if (e) return next(e)
            res.append('X-Total-Count', count)
            /*links = query.links(fullUrl(req), count)
            console.log(links);
            if (links) res.links(links)*/
            let find = req.collectionClass.find(query.criteria)
            populate.split(',').forEach(value => {
              find.populate(value.trim());
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
                if (e) return next(e)
                res.locals.json = results
                next()
            })
        })
    })

    router.post('/:collection', function (req, res, next) {
        if (!req.body || isEmpty(req.body)) throw { status: 400, message: 'No Request Body' } // Bad Request
        let obj = new req.collectionClass(req.body);

        obj.save(function (e, result) {
            if (e) return next(e)
            res.append('Location', fullUrl(req) + '/' + result._id)
            res.status(201) // Created
            res.locals.json = result
            next()
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
        req.collectionClass.findOne(req.idMatch, function (e, result) {
            if (e) return next(e)
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

        req.collectionClass.findByIdAndUpdate(req.body._id, req.body, { new: true }, function (e, result) {
          if (e) return next(e)

          res.locals.json = result
          next()
        });
    })

    router.patch('/:collection/:id', function (req, res, next) {
        if (!req.body || isEmpty(req.body)) throw { status: 400, message: 'No Request Body' } // Bad Request
        req.body._id = normalizeId(req.params.id)

        req.collectionClass.findByIdAndUpdate(req.body._id, { $set: req.body }, { new: true }, function (e, result) {
          if (e) return next(e)

          res.locals.json = result
          next()
        });
    })

    router.delete('/:collection/:id', function (req, res, next) {
      req.collectionClass.findOne(req.idMatch, function (e, result) {
          if (e) return next(e)
          if (!result) res.status(404).send({not_found:true})
          else
            result.remove(function (e, result) {
                if (e) return next(e)
                res.status(204).send(); // No Content
            })
      })
    })

    // TODO: sub-resources (ie., get/post on /:collection/:id/resource)

    return router
}

function convertId(req, res, next) {
    if (res.locals.json instanceof Array) {
        res.locals.json.forEach(renameIdKey)
    } else if (res.locals.json) {
        renameIdKey(res.locals.json)
    }
    next()
}

function renameIdKey(obj) {
    if (obj) {
        obj.id = obj._id
        delete obj._id
    }
    return obj
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
