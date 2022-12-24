const express = require('express')

const { User, Spot, SpotImage, Session, Booking, Review, ReviewImage, sequelize } = require('../../db/models');
const { check } = require('express-validator');
const { handleValidationErrors } = require('../../utils/validation');
const { requireAuth } = require('../../utils/auth')
const { Op } = require('sequelize');

const router = express.Router();

const spotValidator = [
    check('address').exists({ checkFalsy: true }).withMessage("Street address is required"),
    check('city').exists({ checkFalsy: true }).withMessage("City is required"),
    check('state').exists({ checkFalsy: true }).withMessage("State is required"),
    check('country').exists({ checkFalsy: true }).withMessage("Country is required"),
    check('lat').exists({ checkFalsy: true }).withMessage("Latitude is not valid"),
    check('lng').exists({ checkFalsy: true }).withMessage("Longitude is not valid"),
    check('name').exists({ checkFalsy: true }).isLength({ max: 49 }).withMessage( "Name must be less than 50 characters"),
    check('description').exists({ checkFalsy: true }).withMessage("Description is required"),
    check('price').exists({ checkFalsy: true }).withMessage("Price per day is required"),
    handleValidationErrors
]

const reviewValidator = [
    check('review').exists({ checkFalsy: true }).withMessage("Review text is required"),
    check('stars').exists({ checkFalsy: true }).isLength({min: 1, max: 5}).withMessage("Stars must be an integer from 1 to 5"),
    handleValidationErrors
]

const validateQuerys = [
    check('page').isInt({min: 1, max: 10}).withMessage("Page must be greater than or equal to 1").toInt().default(1),
    check('size').isInt({min: 1}).withMessage("Page must be greater than or equal to 1").toInt().default(20),
    check('maxLat').isDecimal().withMessage("Maximum latitude is invalid").optional(),   
    check('minLat').isDecimal().withMessage("Minimum latitude is invalid").optional(),    
    check('minLng').isDecimal().withMessage("Minimum longitude is invalid").optional(),    
    check('maxLng').isDecimal().withMessage("Maximum longitude is invalid").optional(),    
    check('minPrice').isDecimal({min: 0}).withMessage("Minimum price must be greater than or equal to 0").optional(),    
    check('maxPrice').isDecimal({min: 0}).withMessage("Maximum price must be greater than or equal to 0").optional(),
    handleValidationErrors    
]


//! Create a Review for a Spot based on the Spot's id
router.post('/:spotId/reviews', reviewValidator, requireAuth, async (req, res, next) => {
    const spot = await Spot.findByPk(req.params.spotId)
    const { review, stars } = req.body
    const userId = req.user.id

    if (!spot) {
        res.status(404)
        res.json({
            "message": "Spot couldn't be found",
            "statusCode": 404
        })
    }
    const singleReview = await Review.findOne({
        where: {
            userId,
            spotId: req.params.spotId
        }
    })

    // if there is already a review in place
    if (singleReview) {
        res.status(403)
        res.json({
            "message": "User already has a review for this spot",
            "statusCode": 403
          })
    } 
    // otherwise create a new review
    else {
        const officialReview = await Review.create({
                userId,
                spotId: req.params.spotId,
                review,
                stars
        })

        if (stars > 5) {
            res.status(400)
            res.json({
                "message": "Bad request.",
                "statusCode": 400,
                "errors": [
                    "Stars must be an integer from 1 to 5"
                ]
            })
        }

        if (stars < 1) {
            res.status(400)
            res.json({
                "message": "Bad request.",
                "statusCode": 400,
                "errors": [
                    "Stars must be an integer from 1 to 5"
                ]
            })
        }
        res.status(201)
        res.json(officialReview)
    }

})

//! Create a Booking from a Spot based on the Spot's id
router.post('/:spotId/bookings', requireAuth, async (req, res, next) => {
    const { startDate, endDate } = req.body
    const spotById = await Spot.findByPk(req.params.spotId)
    const userId = req.user.id

    if (!spotById) {
        res.status(404)
        res.json({
            "message": "Spot couldn't be found",
            "statusCode": 404
        })
    }

    const bookings = await Booking.findOne({
        //! checking if bookings have dates that overlap with each other
        where: {
            spotId: req.params.spotId,
            startDate: { [Op.lte]: endDate },
            endDate: { [Op.gte]: startDate}
        }
    })
        //! if there are overlapping bookings this error is thrown
    if (bookings) {
        res.status(403)
        res.json({
            "message": "Sorry, this spot is already booked for the specified dates",
            "statusCode": 403,
            "errors": {
              "startDate": "Start date conflicts with an existing booking",
              "endDate": "End date conflicts with an existing booking"
            }
          })
    }

    const startDate2 = new Date(startDate);
    const endDate2 = new Date(endDate);
    
    if (endDate2 <= startDate2) {
        res.status(400)
        res.json({
            message: "Validation error",
            statusCode: 400,
            errors: {
              endDate: "endDate cannot be on or before startDate",
            },
          });
    }

    // if (userId !== spotById.ownerId) {
        const newBooking = await Booking.create({
            spotId: req.params.spotId,
            userId,
            startDate,
            endDate
        })
        res.json(newBooking)
    // } 

})

//! Create A Spot 
router.post('/', spotValidator, requireAuth, async (req, res, next) => {
    const { address, city, state, country, lat, lng, name, description, price } = req.body
    const ownerId = req.user.id

    const spot = await Spot.create({
        ownerId,
        ...req.body,
    })

    res.status(201)
    return res.json(spot)
    
})

//! Add an Image to a Spot based on the Spot's id
router.post('/:spotId/images', requireAuth, async (req, res, next) => {
    const spot = await Spot.findByPk(req.params.spotId)
    const { url, preview } = req.body
    const ownerId = req.user.id

    if (!spot) {
        res.status(404);
        res.json({
            "message": "Spot couldn't be found",
            "statusCode": 404      
        })
    }
    
    // if (ownerId !== spot.ownerId) {
    //     const error = Error('Authorization not granted')
    //     error.status(403)
    //     next(error)
    // }

    const image = await SpotImage.create({
        url,
        preview,
        spotId: spot.id 
    })   
    
    // spot.addSpotImage(image)
    
    const spotImageInfo = {
        id: image.id,
        url: image.url,
        preview: image.preview,
        // spotId: image.spotId
    }
    
    return res.json(spotImageInfo)
})

//! Edit a Spot
router.put('/:spotId', spotValidator, requireAuth, async (req, res, next) => {
    const { address, city, state, country, lat, lng, name, description, price } = req.body
    const updatedSpot = await Spot.findByPk(req.params.spotId)
    const ownerId = req.user.id


    if (!updatedSpot) {
        res.status(404);
        res.json({
            "message": "Spot couldn't be found",
            "statusCode": 404      
        })
    }

    // if (ownerId !== spot.ownerId) {
    //     const error = Error('Authorization not granted')
    //     error.status(403)
    //     next(error)
    // }

    await updatedSpot.set({
        ownerId,
        ...req.body
    })

    return res.json(updatedSpot)

})

//! Get all spots owned by current User
router.get('/current', async (req, res, next) => {
    const spots = await Spot.findAll({
        where: {
            ownerId: req.user.id
        }
    })

    const finalSpotList = []
    for (let spot of spots) {
        const review = await spot.getReviews({
            attributes: [[sequelize.fn('AVG', sequelize.col('stars')), 'avgRating']]
        })
        const avgObject = review[0].toJSON()
        const avgRating = avgObject.avgRating
        console.log(review)

        const spots = await Spot.findAll({
            where: {
                ownerId: req.user.id
            },
            include: [
                {model: Review},
                {model: SpotImage}
            ]
        })
    
        let spotsList = []
        spots.forEach(spot => {
            spotsList.push(spot.toJSON())
        })
    
        spotsList.forEach(spot => {
            spot.SpotImages.forEach(image => {
                if (image.preview) {
                     spot.preview = image.url
                }
            })
            if (!spot.preview) {
                spot.preview = 'No preview image available.'
            }
            delete spot.SpotImages
                
            const info = {
                id: spot.id,
                ownerId: spot.ownerId,
                address: spot.address,
                city: spot.city,
                state: spot.state,
                country: spot.country,
                lat: spot.lat,
                lng: spot.lng,
                name: spot.name,
                description: spot.description,
                price: spot.price,
                createdAt: spot.createdAt,
                updatedAt: spot.updatedAt,
                avgRating: avgRating,
                previewImage: spot.preview
            }
                finalSpotList.push(info)

            })
    }

    return res.json({
        Spots: finalSpotList
    })
    
})

//! Get all Reviews by a Spot's id
router.get('/:spotId/reviews', async (req, res, next) => {
    const spot = await Spot.findByPk(req.params.spotId)

    if (!spot) {
        res.status(404)
        res.json({
            "message": "Spot couldn't be found",
            "statusCode": 404
          })
    }

    const review = await Review.findAll({
        where: {
            spotId: req.params.spotId
        },

        include: [
           { model: User, attributes: ['id', 'firstName', 'lastName'] },
           { model: ReviewImage, attributes: ['id', 'url']}
        ]
    })
    
    return res.json({
        Reviews: review})
})

//! Get all Bookings for a Spot based on the Spot's id
router.get('/:spotId/bookings', requireAuth, async (req, res, next) => {
    const spot = await Spot.findByPk(req.params.spotId) 
    const ownerId = req.user.id 

    if (!spot) {
        res.status(404)
        res.json({
            "message": "Spot couldn't be found",
            "statusCode": 404
          })
    }

    const usersBooking = await Booking.findAll({
        where: {
            spotId: req.params.spotId
          },
        attributes: [ 'spotId', 'startDate', 'endDate' ]
    })
    const ownersBooking = await Booking.findAll({
        where: {
            spotId: req.params.spotId
          },
        include: [
            { model: User, attributes: ['id', 'firstName', 'lastName'] }
        ]
    })


    if (ownerId !== spot.ownerId) {
        res.json({
            Bookings: usersBooking
        })
    } else {
        res.json({
           Bookings: ownersBooking
        })
    }
})

//! Get details of a Spot from an id
router.get('/:spotId', async (req, res, next) => {
    const spot = await Spot.findByPk(req.params.spotId)
    
    const spotsList = []
    const review = await spot.getReviews({
        attributes: [[sequelize.fn('AVG', sequelize.col('stars')), 'avgRating']]
    })
    const avgObject = review[0].toJSON()
    const avgRating = avgObject.avgRating

    const image = await SpotImage.findAll({
        attributes: [ 'id', 'url', 'preview' ]
    })

    const user = await User.findOne({
        attributes: ['id', 'firstName', 'lastName']
    })

    let filteredSpotImage = await SpotImage.findOne({
        where: {
            preview: true,
            spotId: spot.id
        }
    })
    
    const reviewCount = await Review.count({ where: { spotId: spot.id } });

    if (filteredSpotImage) filteredSpotImage = filteredSpotImage.url
    else filteredSpotImage.preview = 'No image available'
    
    const spotsInfo = {
        id: spot.id,
        ownerId: spot.ownerId,
        address: spot.address,
        city: spot.city,
        state: spot.state,
        country: spot.country,
        lat: spot.lat,
        lng: spot.lng,
        name: spot.name,
        description: spot.description,
        price: spot.price,
        createdAt: spot.createdAt,
        updatedAt: spot.updatedAt,
        numReviews: reviewCount,
        avgStarRating: avgRating,
        // previewImage: filteredSpotImage,
        SpotImages: image,
        Owner: user
    }
    spotsList.push(spotsInfo)

    if (!spot) {
        res.status(404)
        res.json({
            "message": "Spot couldn't be found",
            "statusCode": 404
          })
    }
    if (spot) {
        res.json(spotsList)
    }
})



//! Delete a Spot
router.delete('/:spotId', requireAuth, async (req, res, next) => {
    const spot = await Spot.findByPk(req.params.spotId)

    if (!spot) {
        res.status(404)
        res.json({
            "message": "Spot couldn't be found",
            "statusCode": 404        
          })
    }

    if (spot) {
        await spot.destroy()
        res.json({
            "message": "Successfully deleted",
            "statusCode": 200
        })
    }
})  

//! GET ALL SPOTS
router.get('/', validateQuerys, async (req, res, next) => {
    let { page, size, minLat, maxLat, mLng, maxLng, minPrice, maxPrice } = req.query
    if (!page) page = 1
    if (!size) size = 20
    page = parseInt(page)
    size = parseInt(size) 

    if (!page || page > 20) page = 1
    if (!size || size > 20) size = 20

    let pagination = {};

    if (size >= 1 && page >= 1) {
      pagination.limit = size;
      pagination.offset = size * (page - 1);
    }

    const spots = await Spot.findAll()
    const finalSpotList = []
    for (let spot of spots) {
        const review = await spot.getReviews({
            attributes: [[sequelize.fn('AVG', sequelize.col('stars')), 'avgRating']]
        })
        const avgObject = review[0].toJSON()
        const avgRating = avgObject.avgRating

        const spots = await Spot.findAll({
            include: [
                {model: Review},
                {model: SpotImage}
            ]
        })
    
        let spotsList = []
        spots.forEach(spot => {
            spotsList.push(spot.toJSON())
        })
    
        spotsList.forEach(spot => {
            spot.SpotImages.forEach(image => {
                if (image.preview) {
                     spot.preview = image.url
                }
            })
            if (!spot.preview) {
                spot.preview = 'No preview image available.'
            }
            delete spot.SpotImages
                
            const info = {
                id: spot.id,
                ownerId: spot.ownerId,
                address: spot.address,
                city: spot.city,
                state: spot.state,
                country: spot.country,
                lat: spot.lat,
                lng: spot.lng,
                name: spot.name,
                description: spot.description,
                price: spot.price,
                createdAt: spot.createdAt,
                updatedAt: spot.updatedAt,
                avgRating: avgRating,
                previewImage: spot.preview
            }
                finalSpotList.push(info)

            })
    }

    return res.json({
        Spots: finalSpotList
    })

    //! Initial way I completed this route
    // const spots = await Spot.findAll()
    // const spotsList = []
    // for (let spot of spots) {
    //     const review = await spot.getReviews({
    //         attributes: [[sequelize.fn('AVG', sequelize.col('stars')), 'avgRating']]
    //     })
    //     const avgObject = review[0].toJSON()
    //     const avgRating = avgObject.avgRating

    //     let spotImage = await SpotImage.findOne({
    //         where: {
    //             preview: true,
    //             spotId: spot.id
    //         }
    //     })

    //     if (spotImage) spotImage = spotImage.url
    //     else spotImage.preview = 'No image available'
        
    //     const spots = {
    //         id: spot.id,
    //         ownerId: spot.ownerId,
    //         address: spot.address,
    //         city: spot.city,
    //         state: spot.state,
    //         country: spot.country,
    //         lat: spot.lat,
    //         lng: spot.lng,
    //         name: spot.name,
    //         description: spot.description,
    //         price: spot.price,
    //         createdAt: spot.createdAt,
    //         updatedAt: spot.updatedAt,
    //         avgRating: avgRating,
    //         previewImage: spotImage
    //     }
    //     spotsList.push(spots)
    // }

    // return res.json({
    //     Spots: spotsList
    // })
})


module.exports = router