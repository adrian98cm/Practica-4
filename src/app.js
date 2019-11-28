import { MongoClient, ObjectID } from "mongodb";
import { GraphQLServer } from "graphql-yoga";
import * as uuid from 'uuid';

import "babel-polyfill";

const usr = "adrian";
const pwd = "12345";
const url = "server1-zlr9p.mongodb.net/test?retryWrites=true&w=majority";

/**
 * Connects to MongoDB Server and returns connected client
 * @param {string} usr MongoDB Server user
 * @param {string} pwd MongoDB Server pwd
 * @param {string} url MongoDB Server url
 */
const connectToDb = async function(usr, pwd, url) {
  const uri = `mongodb+srv://${usr}:${pwd}@${url}`;
  const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  await client.connect();
  return client;
};

const getDateTime = () => {
  var today = new Date();
  var date = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
  var time = today.getHours() + ':' + today.getMinutes() + ':' + today.getSeconds();
  var dateTime = date + ' ' + time;

  return dateTime;
}

/**
 * Starts GraphQL server, with MongoDB Client in context Object
 * @param {client: MongoClinet} context The context for GraphQL Server -> MongoDB Client
 */
const runGraphQLServer = function (context) {
  const typeDefs = `
    
    type Query{
      login(nombre: String!, contrasena: String!):Usuario
      logout(nombre: String!, token: ID!):Usuario
      getFacturas(nombre: String!,token:ID!):[Factura]
    }

    type Mutation{
      addUser(nombre: String!, contrasena: String!):Usuario!
      addFactura(concepto: String!, cantidad: String!, titular: String!, token: ID!, nombre:String!):Factura!
      removeUser(nombre: String!, token: ID!):Usuario
    }

    type Factura{
      fecha: String!
      concepto: String!
      cantidad: String!
      titular: Usuario!
    }

    type Usuario{
      nombre: String!
      contrasena: String!
      id: ID!
      token: ID
    }
    `;

  const resolvers = {
   
    Factura:{
      titular:async(parent,args,ctx,info)=>{
        const titularnombre = parent.titular;
        const {client} = ctx;
        const db = client.db("loginSystem");
        const collection = db.collection("users");

        return(await collection.findOne({nombre: titularnombre}));
      }
    },

    Query:{
      login: async (parent, args, ctx, info) => {
        const { nombre, contrasena } = args;
        const { client } = ctx;
        const db = client.db("loginSystem");
        const collection = db.collection("users");
        
        if(!await collection.findOne({nombre,contrasena})){
          throw new Error("El usuario no existe o la contraseña no es correcta")
        }

        await collection.updateOne({nombre}, {$set: {"token": uuid.v4()}});
        const result = await collection.findOne({nombre});
        return result;

      },
      logout: async (parent, args, ctx, info) => {
        const { nombre, token } = args;
        const { client } = ctx;
        const db = client.db("loginSystem");
        const collection = db.collection("users");
        
        if(!await collection.findOne({nombre,token})){
          throw new Error("El usuario no existe")
        }

        if(await collection.findOne({nombre,token})){
        if(token === null){//titular
          throw new Error("El usuario no ha iniciado sesion");

        }
        await collection.updateOne({nombre}, {$set: {"token":null}});
        }
        const result = await collection.findOne({nombre});
        
        return result;


      },
      
      getFacturas: async (parent, args, ctx, info) =>{
        const { nombre, token } = args;
        const { client } = ctx;
        const db = client.db("loginSystem");
        const collection = db.collection("users");
        const collection2 = db.collection("facturas");

        if(!await collection.findOne({nombre,token})){
          throw new Error("El usuario no existe")
        }        
        const result = await collection2.find({titular:nombre}).toArray();
        return result;
        }

    },


    
    Mutation: {
      addUser: async (parent, args, ctx, info) => {
        const { nombre, contrasena } = args;
        const { client } = ctx;

        const db = client.db("loginSystem");
        const collection = db.collection("users");

        if (await collection.findOne({nombre})) {
          throw new Error(`Author with name ${nombre} already exists`)
        }

        const result = await collection.insertOne({ nombre, contrasena});

        return{
          nombre,
          contrasena, 
          id: result.ops[0]._id,
        }

      },
      
      addFactura: async (parent, args, ctx, info) => {
        const { concepto, cantidad , titular, token, nombre } = args;
        const { client } = ctx;

        const db = client.db("loginSystem");
        const collection = db.collection("facturas");
        const collection2 = db.collection("users");

        const fecha = getDateTime();

        if(!await collection2.findOne({nombre,token})){
          throw new Error('El usuario no esta logueado o no existe')
        }

        const result = await collection.insertOne({ concepto, cantidad, titular, fecha});

        return{
          concepto,
          cantidad,
          titular,
          fecha
        }

      },

      removeUser: async (parent, args, ctx, info) => {
        const { nombre, token } = args;
        const { client } = ctx;

        const db = client.db("loginSystem");
        const collection = db.collection("users");
        const collection2 = db.collection("facturas");


        if(!await collection.findOne({nombre,token})){
          throw new Error("El usuario no existe")
        }

        const result = await collection.findOneAndDelete({nombre,token});

        await collection2.deleteMany({titular:nombre});


      }
    }
  };

  const server = new GraphQLServer({ typeDefs, resolvers, context });
  const options = {
    port: 8000
  };

  try {
    server.start(options, ({ port }) =>
      console.log(
        `Server started, listening on port ${port} for incoming requests.`
      )
    );
  } catch (e) {
    console.info(e);
    server.close();
  }
};

const runApp = async function() {
  const client = await connectToDb(usr, pwd, url);
  console.log("Connect to Mongo DB");
  try {
    runGraphQLServer({ client });
  } catch (e) {
    client.close();
  }
};

runApp();