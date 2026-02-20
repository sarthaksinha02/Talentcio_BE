const Holiday = require('../models/Holiday');

// @desc    Get all holidays
// @route   GET /api/holidays
// @access  Private
exports.getHolidays = async (req, res) => {
    try {
        const year = req.query.year || new Date().getFullYear();
        const holidays = await Holiday.find({
            year: year
        }).sort({ date: 1 });

        res.json(holidays);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Add a holiday
// @route   POST /api/holidays
// @access  Private (Admin only)
exports.addHoliday = async (req, res) => {
    const { name, date, isOptional } = req.body;

    try {
        const year = new Date(date).getFullYear();

        const newHoliday = new Holiday({
            name,
            date,
            isOptional,
            year
        });

        const holiday = await newHoliday.save();
        res.json(holiday);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Update a holiday
// @route   PUT /api/holidays/:id
// @access  Private (Admin only)
exports.updateHoliday = async (req, res) => {
    const { name, date, isOptional } = req.body;

    try {
        let holiday = await Holiday.findById(req.params.id);

        if (!holiday) {
            return res.status(404).json({ msg: 'Holiday not found' });
        }

        const taskFields = {};
        if (name) taskFields.name = name;
        if (date) {
            taskFields.date = date;
            taskFields.year = new Date(date).getFullYear();
        }
        if (isOptional !== undefined) taskFields.isOptional = isOptional;

        holiday = await Holiday.findByIdAndUpdate(
            req.params.id,
            { $set: taskFields },
            { new: true }
        );

        res.json(holiday);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Delete a holiday
// @route   DELETE /api/holidays/:id
// @access  Private (Admin only)
exports.deleteHoliday = async (req, res) => {
    try {
        let holiday = await Holiday.findById(req.params.id);

        if (!holiday) {
            return res.status(404).json({ msg: 'Holiday not found' });
        }

        await Holiday.findByIdAndDelete(req.params.id);

        res.json({ msg: 'Holiday removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
