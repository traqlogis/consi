// backend/models/Package.js
import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Package = sequelize.define('Package', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    code: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    packageInfo: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {
            sender: { name: "", address: "", phone: "" },
            receiver: { name: "", address: "", phone: "" },
            deliveryType: "Standard",
            weight: "",
            description: ""
        }
    },
    current: {
        type: DataTypes.JSONB,
        allowNull: false,
    },
    route: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
    },
    traveled: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
    },
    currentRouteIndex: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    isMoving: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    //"Held at customs", "Traffic congestion", "Mechanical breakdown", "Scheduled rest stop"
    pauseReason: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null
    },
    estimatedResumeTime: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
    },
    statusLogs: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
    }
}, {
    timestamps: true
});

export default Package;