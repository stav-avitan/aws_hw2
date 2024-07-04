const express = require('express');
const AWS = require('aws-sdk');
const RestaurantsMemcachedActions = require('./model/restaurantsMemcachedActions');

const app = express();
app.use(express.json());

const MEMCACHED_CONFIGURATION_ENDPOINT = process.env.MEMCACHED_CONFIGURATION_ENDPOINT;
const TABLE_NAME = process.env.TABLE_NAME;
const AWS_REGION = process.env.AWS_REGION;
const USE_CACHE = process.env.USE_CACHE === 'true';

const memcachedActions = new RestaurantsMemcachedActions(MEMCACHED_CONFIGURATION_ENDPOINT);

const dbInstance = new AWS.DynamoDB.DocumentClient({ region: AWS_REGION });

app.get('/', (req, res) => {
    const response = {
        MEMCACHED_CONFIGURATION_ENDPOINT: MEMCACHED_CONFIGURATION_ENDPOINT,
        TABLE_NAME: TABLE_NAME,
        AWS_REGION: AWS_REGION,
        //USE_CACHE: USE_CACHE
    };
    res.send(response);
});

app.post('/restaurants', async (req, res) => {
    const restaurant = req.body;

    const getParams = {
        TableName: TABLE_NAME,
        Key: {
            SimpleKey: restaurant.name
        }
    };

    const params = {
        TableName: TABLE_NAME,
        Item: {
            SimpleKey: restaurant.name,
            Cuisine: restaurant.cuisine,
            GeoRegion: restaurant.region,
            Rating: restaurant.rating || 0,
            RatingCount: 0
        }
    };

    if (USE_CACHE) {
        try {
            const cachedRestaurant = await memcachedActions.getRestaurants(restaurant.name);
            if (cachedRestaurant) {
                res.status(409).send({ success: false, message: 'Restaurant already exists' });
                return;
            }
        } catch (err) {
            console.error('Error', err);
            res.status(500).send("Internal Server Error");
        }
    }

    try {
        const data = await dbInstance.get(getParams).promise();

        if (data.Item) {
            res.status(409).send({ success: false, message: 'Restaurant already exists' });
            return;
        }

        await dbInstance.put(params).promise();

        if (USE_CACHE) {
            await memcachedActions.addRestaurants(restaurant.name, restaurant);
        }

        res.status(200).send({ success: true });
    } catch (err) {
        console.error('Error', err);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/restaurants/:restaurantName', async (req, res) => {
    const restaurantName = req.params.restaurantName;

    const params = {
        TableName: TABLE_NAME,
        Key: {
            SimpleKey: restaurantName
        }
    };

    if (USE_CACHE) {
        try {
            const cachedRestaurant = await memcachedActions.getRestaurants(restaurantName);
            if (cachedRestaurant.Item) {
                const data = cachedRestaurant.Item;
                res.status(200).json( {
                    name: restaurantName,
                    cuisine: data.cuisine,
                    rating: data.rating || 0,
                    region: data.region
                });
                return;
            }
        } catch (err) {
            console.error('Error', err);
            res.status(500).send("Internal Server Error");
        }
    }

    try {
        const data = await dbInstance.get(params).promise();

        if (!data.Item) {
            res.status(404).send({ message: 'Restaurant not found' });
            return;
        }

        const restaurant = {
            name: data.Item.SimpleKey,
            cuisine: data.Item.Cuisine,
            rating: data.Item.Rating || 0,
            region: data.Item.GeoRegion
        };

        if (USE_CACHE) {
            await memcachedActions.addRestaurants(restaurant.name, restaurant);
        }

        res.status(200).send(restaurant);
    } catch (err) {
        console.error('Error', err);
        res.status(500).send('Internal Server Error');
    }
});

app.delete('/restaurants/:restaurantName', async (req, res) => {
    const restaurantName = req.params.restaurantName;

    const params = {
        TableName: TABLE_NAME,
        Key: {
            SimpleKey: restaurantName
        }
    };

    try {
        const data = await dbInstance.get(params).promise();

        if (!data.Item) {
            res.status(404).send({ message: 'Restaurant not found' });
            return;
        }

        await dbInstance.delete(params).promise();

        if (USE_CACHE) {
            await memcachedActions.deleteRestaurants(restaurantName);
        }

        res.status(200).send({ success: true });
    } catch (err) {
        console.error('Error', err);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/restaurants/rating', async (req, res) => {
    const restaurantName = req.body.name;
    const rating = req.body.rating;

    const params = {
        TableName: TABLE_NAME,
        Key: {
            SimpleKey: restaurantName
        }
    };

    try {
        const data = await dbInstance.get(params).promise();

        if (!data.Item) {
            res.status(404).send("Restaurant not found");
            return;
        }

        const oldRating = data.Item.Rating || 0;
        const ratingCount = data.Item.RatingCount || 0;
        const newAverageRating = ((oldRating * ratingCount) + rating) / (ratingCount + 1);

        const updateParams = {
            TableName: TABLE_NAME,
            Key: {
                SimpleKey: restaurantName
            },
            UpdateExpression: 'set Rating = :r, RatingCount = :rc',
            ExpressionAttributeValues: {
                ':r': newAverageRating,
                ':rc': ratingCount + 1
            }
        };

        await dbInstance.update(updateParams).promise();

        if (USE_CACHE) {
            await memcachedActions.addRestaurants(restaurantName, {
                name: restaurantName,
                cuisine: data.Item.Cuisine,
                rating: newAverageRating,
                region: data.Item.GeoRegion
            });
        }

        res.status(200).send({ success: true });
    } catch (err) {
        console.error('Error', err);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/restaurants/cuisine/:cuisine', async (req, res) => {
    const cuisine = req.params.cuisine;
    let limit = req.query.limit;
    limit = Math.min(parseInt(req.query.limit), 100) || 10;
    const minRating = parseFloat(req.query.minRating) || 0;

    const cacheKey = `${cuisine}`;

    if (USE_CACHE) {
        try {
            const cachedRestaurants = await memcachedActions.getRestaurants(cacheKey);
            if (cachedRestaurants) {
                res.status(200).send(cachedRestaurants);
                return;
            }
        } catch (err) {
            console.error('Error', err);
            res.status(500).send("Internal Server Error");
        }
    }

    const params = {
        TableName: TABLE_NAME,
        IndexName: 'CuisineIndex',
        KeyConditionExpression: 'Cuisine = :cuisine',
        ExpressionAttributeValues: {
            ':cuisine': cuisine,
        },
        Limit: limit,
        ScanIndexForward: false
    };

    try {
        const data = await dbInstance.query(params).promise();
        const filteredRestaurants = data.Items.filter(item => item.Rating >= minRating);

        const restaurants = filteredRestaurants.map(item => ({
            cuisine: item.Cuisine,
            name: item.SimpleKey,
            rating: item.Rating,
            region: item.GeoRegion
        }));

        if (USE_CACHE) {
            await memcachedActions.addRestaurants(cacheKey, restaurants);
        }

        res.status(200).json(restaurants);
    } catch (err) {
        console.error('Error', err);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/restaurants/region/:region', async (req, res) => {
    const region = req.params.region;
    let limit = req.query.limit;
    limit = Math.min(parseInt(req.query.limit), 100) || 10;

    const cacheKey = `${region}`;

    if (USE_CACHE) {
        try {
            const cachedRestaurants = await memcachedActions.getRestaurants(cacheKey);
            if (cachedRestaurants) {
                res.status(200).send(cachedRestaurants);
                return;
            }
        } catch (err) {
            console.error('Error', err);
            res.status(500).send("Internal Server Error");
        }
    }

    const params = {
        TableName: TABLE_NAME,
        IndexName: 'GeoRegionIndex',
        KeyConditionExpression: 'GeoRegion = :geoRegion',
        ExpressionAttributeValues: {
            ':geoRegion': region
        },
        Limit: limit,
        ScanIndexForward: false
    };

    try {
        const data = await dbInstance.query(params).promise();

        const restaurants = data.Items.map(item => {
            return {
                cuisine: item.Cuisine,
                name: item.SimpleKey,
                rating: item.Rating,
                region: item.GeoRegion
            };
        });

        if (USE_CACHE) {
            await memcachedActions.addRestaurants(cacheKey, restaurants);
        }

        res.status(200).json(restaurants);
    } catch (err) {
        console.error('Error', err);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/restaurants/region/:region/cuisine/:cuisine', async (req, res) => {
    const region = req.params.region;
    const cuisine = req.params.cuisine;
    let limit = req.query.limit;
    limit = Math.min(parseInt(req.query.limit), 100) || 10;

    const cacheKey = `${region}_${cuisine}`;

    if (USE_CACHE) {
        try {
            const cachedRestaurants = await memcachedActions.getRestaurants(cacheKey);
            if (cachedRestaurants) {
                res.status(200).send(cachedRestaurants);
                return;
            }
        } catch (err) {
            console.error('Error', err);
            res.status(500).send("Internal Server Error");
        }
    }

    const params = {
        TableName: TABLE_NAME,
        IndexName: 'GeoRegionCuisineIndex',
        KeyConditionExpression: 'GeoRegion = :geoRegion and Cuisine = :cuisine',
        ExpressionAttributeValues: {
            ':geoRegion': region,
            ':cuisine': cuisine
        },
        Limit: limit,
        ScanIndexForward: false
    };

    try {
        const data = await dbInstance.query(params).promise();

        const restaurants = data.Items.map(item => {
            return {
                cuisine: item.Cuisine,
                name: item.SimpleKey,
                rating: item.Rating,
                region: item.GeoRegion
            };
        });

        if (USE_CACHE) {
            await memcachedActions.addRestaurants(cacheKey, restaurants);
        }

        res.status(200).json(restaurants);
    } catch (err) {
        console.error('Error', err);
        res.status(500).send('Internal Server Error');
    }
});
app.listen(80, () => {
    console.log('Server is running on http://localhost:80');
});

module.exports = { app };