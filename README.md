# express-mongo-rest
Node.js package to create an express middleware for a mongo-backed, RESTful API

```
var express = require('express')
var expressMongoRest = require('express-mongo-rest')
var app = express()
app.use('/api/v1', expressMongoRest('mongodb://localhost:27017/mydb'))
var server = app.listen(3000, function () {
    console.log('Listening on Port', server.address().port)
})
```
The middleware is schema-agnostic, allowing any json document to be persisted and retrieved from mongo.

| Route            | Method | Notes                       |
| ---------------- | ------ | --------------------------- |
| /:collection     | GET    | Search the collection (uses [query-to-mongo](https://www.npmjs.com/package/query-to-mongo)) |
| /:collection     | POST   | Create a single document    |
| /:collection     | PUT    | Method Not Allowed          |
| /:collection     | PATCH  | Method Not Allowed          |
| /:collection     | DELETE | Remove all documents        |
| /:collection/:id | GET    | Retrieve a single document  |
| /:collection/:id | POST   | Method Not Allowed          |
| /:collection/:id | PUT    | Create or update a document |
| /:collection/:id | PATCH  | Version 0.9                 |
| /:collection/:id | DELETE | Remove a single document    |
| Cascade post     | POST   | Version 1.0                 |
| Cascade put      | POST   | Version 1.1                 |

## API
### expressMongooseRestful(db, options)
Create an express middleware that implements a RESTful API.

#### options:
* **envelope** Return responses wrapped in a type envelope. This can be overriden per request by specifying an _envelope_ query parameter.
* **singularize** A function to change the collection name into it's singlur form (ie., 'users' becomes 'user'). Used when returning a envelope for a single instance. Default is [inflection.singularize](https://www.npmjs.com/package/inflection).

### Querying documents
The query API (GET /:collection) uses a robust query syntax that interprets comparision operators (=, !=, >, <, >=, <=) in the query portion of the URL using [query-to-mongo](https://www.npmjs.com/package/query-to-mongo).

For example, the URL `https://localhost/api/v1/users?firstName=John&age>=21` would search the _users_ collection for any entries that have a _firstName_ of "John" and an _age_ greater than or equal to 21.

### Returning result envelopes
The APIs that return results (all except DELETE) can be set to wrap those results in a type envelope; either server-wide by specifying the _envelope_ option when creating the middleware, or per request by including an _envelope_ query paramter in the URL.

The type envelope will use the singularized name of the collection. The singularizer can be specified using the _singularize_ option when creating the middleware. The default is [inflection.singularize](https://www.npmjs.com/package/inflection).

For example `https://localhost/api/v1/users/2d0aa7b0-cf14-413e-9093-7bbba4f4b220?envelope=true` returns:
```
{
  user: {
    id: '2d0aa7b0-cf14-413e-9093-7bbba4f4b220',
    name: 'John',
    age: 21
  }
}
```
and `https://localhost/api/v1/users/2d0aa7b0-cf14-413e-9093-7bbba4f4b220?envelope=false` returns:
```
{
  id: '2d0aa7b0-cf14-413e-9093-7bbba4f4b220',
  name: 'John',
  age: 21
}
```
The envelope for query results uses the collection name (and assumes it is plural); `https://localhost/api/v1/users?envelope=true` returns:
```
{
  users: [
    {
      id: '2d0aa7b0-cf14-413e-9093-7bbba4f4b220',
      name: 'John',
      age: 21
    },
    {
      id: 'abf445fd-04db-495e-82f7-77fbf369f7ee',
      name: 'Bob',
      age: 28
    }
  ]
}
```

### Post result
Documents are saved using the mongoose ODM save function.

An example post using jQuery and return the document saved:
```
$.ajax('https://localhost/api/v1/users/2d0aa7b0-cf14-413e-9093-7bbba4f4b220', {
  method: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
      name: 'John',
      age: 21
  }),
  success: function (data, status, xhr) {...},
  error: function (xhr, status, err) {...}
})
```
### Post result with mongoose validation

var mongoose = require('mongoose');
var UserSchema = new mongoose.Schema({
  name: { type: String, required: false },
  age: { type: String, required: true },
}, { collection: 'users' });
mongoose.model('User', UserSchema);

An example post using jQuery and return the document saved:
```
$.ajax('https://localhost/api/v1/users/2d0aa7b0-cf14-413e-9093-7bbba4f4b220', {
  method: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({
      name: 'John',
  }),
  success: function (data, status, xhr) {...},
  error: function (xhr, status, err) {...}
})
```
Server response:
```
{
  "errors": {
    "age": {
      "message": "Path `age` is required.",
      "name": "ValidatorError",
      "properties": {
        "message": "Path `{PATH}` is required.",
        "type": "required",
        "path": "type"
        },
      "kind": "required",
      "path": "type",
      "$isValidatorError": true
    }
  },
  "message": "User validation failed: type2: Path `type2` is required., type: Path `type` is required.",
  "name": "ValidationError"
}
```

### Patching documents (Not working / finished)
An example patch using jQuery:
```
$.ajax('https://localhost/api/v1/users/2d0aa7b0-cf14-413e-9093-7bbba4f4b220', {
  method: 'PATCH',
  contentType: 'application/json',
  data: JSON.stringify([
    { op: 'replace', path: '/firstName', value: 'Johnathan' },
    { op: 'replace', path: '/age', value: 22 }
  ]),
  success: function (data, status, xhr) {...},
  error: function (xhr, status, err) {...}
})
```


## Todo
    * Finish rest patch
    * Finish unit test
