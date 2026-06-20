import Package from '../models/package.js';
import { Op } from 'sequelize';

function convertDurationToMinutes(durationStr) {
  if (!durationStr) return 60;
  const normalized = durationStr.toLowerCase().trim();
  const numericValue = parseFloat(normalized.match(/\d+(\.\d+)?/)?.[0] || 60);

  if (normalized.includes('day')) return Math.ceil(numericValue * 24 * 60);
  if (normalized.includes('hr') || normalized.includes('hour')) return Math.ceil(numericValue * 60);
  return Math.ceil(numericValue);
}

// Linear interpolation to glide between route nodes smoothly
function lerp(start, end, amt) {
  return (1 - amt) * start + amt * end;
}

/**
 * Helper to calculate intermediate coordinates based on explicit minute ticks
 */
function getCoordinateAtTime(route, elapsedMinutes, totalMinutes) {
  const globalRatio = Math.min(1, elapsedMinutes / totalMinutes);
  if (globalRatio >= 1) {
    const finalPoint = route[route.length - 1];
    return { lat: finalPoint.lat, lng: finalPoint.lng, index: route.length - 1, isDone: true };
  }

  const totalSegments = route.length - 1;
  const exactSegmentProgress = globalRatio * totalSegments;
  const segmentIndex = Math.floor(exactSegmentProgress);
  const segmentRatio = exactSegmentProgress - segmentIndex;

  const startPoint = route[segmentIndex];
  const endPoint = route[segmentIndex + 1];

  return {
    lat: lerp(startPoint.lat, endPoint.lat, segmentRatio),
    lng: lerp(startPoint.lng, endPoint.lng, segmentRatio),
    index: segmentIndex,
    isDone: false
  };
}

export function startPackageSimulator(io) {
  console.log('Predictive Simulation Engine Active.');

  setInterval(async () => {
    try {
      const activePackages = await Package.findAll({
        where: {
          [Op.or]: [{ isMoving: true }, { isMoving: 'true' }]
        }
      });

      console.log(`Simulator Loop: Processing ${activePackages.length} packages.`);

      for (const pkg of activePackages) {
        const route = pkg.route || [];
        if (route.length < 2) continue;

        const estDuration = pkg.packageInfo?.estDuration || "1 hr";
        const totalMinutes = convertDurationToMinutes(estDuration);

        let simStartedAtStr = pkg.packageInfo?.simStartedAt;
        if (!simStartedAtStr) {
          simStartedAtStr = new Date().toISOString();
          pkg.packageInfo = { ...pkg.packageInfo, simStartedAt: simStartedAtStr };
          pkg.changed('packageInfo', true);
        }

        const startTime = new Date(simStartedAtStr);
        const currentTime = new Date();
        const elapsedMinutes = Math.floor((currentTime - startTime) / 60000);

        // Calculate position right now, and look ahead 1 minute into the future
        const currentPos = getCoordinateAtTime(route, elapsedMinutes, totalMinutes);
        const nextPos = getCoordinateAtTime(route, elapsedMinutes + 1, totalMinutes);

        const logs = pkg.statusLogs || [];

        // Find waypoint name based on the calculated math segment index
        const currentWaypoint = route[currentPos.index];
        const currentSegmentName = currentWaypoint?.name || `Route Checkpoint #${currentPos.index}`;

        // Create the clean unified current point schema object
        const currentPositionWithName = {
          lat: currentPos.lat,
          lng: currentPos.lng,
          name: currentSegmentName
        };

        // Build the named base trace trailing path array up to the current segment boundary
        const traveledBase = route.slice(0, currentPos.index + 1).map(point => ({
          lat: point.lat,
          lng: point.lng,
          name: point.name || "Transit"
        }));

        const strictIsMoving = pkg.isMoving === true || pkg.isMoving === 'true';

        // Check if we jumped forward across multiple indices while server was down
        if (strictIsMoving && currentPos.index !== pkg.currentRouteIndex) {
          const totalSegments = route.length - 1;
          const minutesPerSegment = totalMinutes / totalSegments;
          
          // Loop through every single milestone we missed chronologically up to our current node
          for (let i = pkg.currentRouteIndex + 1; i <= currentPos.index; i++) {
            const missedWaypoint = route[i];
            const missedName = missedWaypoint?.name || `Route Checkpoint ${i}`;

            const historicalTime = new Date(startTime.getTime() + (i * minutesPerSegment * 60000));
            
            logs.push({
              status: "In Transit - Package moving on schedule",
              location: `Routing through ${missedName}`,
              timestamp: historicalTime.toISOString()
            });
          }
        }

        // Handle termination state parameters safely
        if (currentPos.isDone) {
          pkg.isMoving = false;

          const finalIndex = route.length - 1;
          const deliveryTime = new Date(startTime.getTime() + (finalIndex * (totalMinutes / finalIndex) * 60000));
          
          logs.push({
            status: "Delivered Successfully",
            location: currentPositionWithName.name, 
            timestamp: deliveryTime.toISOString()
          });
          // console.log(`Package [${pkg.code}] has arrived safely at: ${currentPositionWithName.name}`);
        }

        // Save updated data attributes back into DB columns safely with names preserved
        pkg.currentRouteIndex = currentPos.index;
        pkg.current = currentPositionWithName; 
        pkg.traveled = [...traveledBase, currentPositionWithName]; 
        pkg.statusLogs = logs;

        pkg.changed('packageInfo', true);
        pkg.changed('statusLogs', true);
        pkg.changed('traveled', true);
        pkg.changed('current', true);

        await pkg.save();

        // Broadcast structural update changes live over sockets
        io.to(pkg.code).emit('positionUpdate', {
          code: pkg.code,
          current: pkg.current, 
          nextTarget: { lat: nextPos.lat, lng: nextPos.lng }, 
          traveledBase: traveledBase,                       
          currentRouteIndex: currentPos.index,
          isMoving: pkg.isMoving,
          statusLogs: pkg.statusLogs
        });

        console.log(`[${pkg.code}] Progress -> Index: ${pkg.currentRouteIndex} | Location Name: "${pkg.current.name}"`);
      }
    } catch (error) {
      console.error('Simulation synchronization failure:', error);
    }
  }, 60000); 
}