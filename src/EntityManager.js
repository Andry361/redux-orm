import omit from 'lodash/object/omit';
import find from 'lodash/collection/find';
import sortByAll from 'lodash/collection/sortByAll';

import QuerySet from './QuerySet';
import Entity from './Entity';
import {
    CREATE,
    UPDATE,
    DELETE,
    ORDER,
} from './constants';
import {match} from './utils.js';

/**
 * A class that manages an entity tree branch.
 *
 * The manager shares the following methods with {@link QuerySet}:
 *
 * - [all]{@link QuerySet#all}
 * - [filter]{@link QuerySet#filter}
 * - [exclude]{@link QuerySet#exclude}
 * - [exists]{@link QuerySet#exists}
 * - [first]{@link QuerySet#first}
 * - [last]{@link QuerySet#last}
 * - [at]{@link QuerySet#at}
 * - [delete]{@link QuerySet#delete}
 * - [update]{@link QuerySet#update}
 *
 */
const EntityManager = class EntityManager {
    /**
     * Create an EntityManager.
     * @param  {object} tree - the tree branch to manage
     * @param  {Schema} - the Schema that defines the branch structure
     */
    constructor(tree) {
        Object.assign(this, {
            tree,
            mutations: [],
        });
    }

    getEntityTree() {
        return this.tree;
    }

    getDefaultState() {
        return this.schema.getDefaultState();
    }

    getEntityMap() {
        return this.getEntityTree()[this._mapName()];
    }

    getIdAttribute() {
        return this.schema.idAttribute;
    }

    getIdArray() {
        return this.getEntityTree()[this._arrName()];
    }

    getFullEntity(id) {
        return Object.assign({[this.getIdAttribute()]: id}, this.getEntityMap()[id]);
    }

    getFullEntities() {
        return this.getIdArray().map((id) => {
            return this.getFullEntity(id);
        });
    }

    nextId() {
        return Math.max(...this.getIdArray()) + 1;
    }

    _mapName() {
        return this.schema.mapName;
    }

    _arrName() {
        return this.schema.arrName;
    }

    _getQuerySet() {
        return new QuerySet(this, this.getIdArray());
    }

    /**
     * Returns a QuerySet containing all entities.
     * @return {QuerySet} a QuerySet containing all entities
     */
    all() {
        return this._getQuerySet();
    }

    at(index) {
        return this._getQuerySet().at(index);
    }

    first() {
        return this._getQuerySet().first();
    }

    last() {
        return this._getQuerySet().last();
    }

    exists() {
        return this._getQuerySet().exists();
    }

    count() {
        return this._getQuerySet().count();
    }

    /**
     * Records the addition of a new entity and returns a
     * new Entity instance.
     * @param  {props} props - the new Entity's properties.
     * @return {Entity} a new Entity instance.
     */
    create(props) {
        this.mutations.push({
            type: CREATE,
            payload: props,
        });
        return new Entity(this, props);
    }

    exclude(lookupObj) {
        return this._getQuerySet().exclude(lookupObj);
    }

    /**
     * Gets the Entity instance that matches properties in `lookupObj`.
     * Throws an error if Entity is not found.
     *
     * @param  {Object} lookupObj - the properties used to match a single entity.
     * @return {Entity} an Entity instance that matches `lookupObj` properties.
     */
    get(lookupObj) {
        if (!this.exists()) {
            throw new Error('Tried getting from empty QuerySet');
        }

        const keys = Object.keys(lookupObj);
        const idAttribute = this.getIdAttribute();
        if (keys.includes(idAttribute)) {
            // We treat `idAttribute` as unique, so if it's
            // in `lookupObj` we search with that attribute only.
            return new Entity(this, this.getFullEntity(lookupObj[idAttribute]));
        }
        const found = find(this.getFullEntities(), entity => match(lookupObj, entity));

        if (!found) {
            throw new Error('Entity not found when calling get method');
        }

        return new Entity(this, found);
    }

    filter(lookupObj) {
        return this._getQuerySet().filter(lookupObj);
    }

    delete() {
        return this._getQuerySet().delete();
    }

    update(updater) {
        return this._getQuerySet().update(updater);
    }

    setOrder(arg) {
        this.mutations.push({
            type: ORDER,
            payload: arg,
        });
    }

    /**
     * Applies recorded mutations and returns a new state tree.
     * @return {Object} the reduced state tree
     */
    reduce() {
        return this.mutations.reduce((state, action) => {
            const next = {
                [this._arrName()]: this.reduceIdArray(state[this._arrName()], action),
                [this._mapName()]: this.reduceEntityMap(state[this._mapName()], action),
            };
            return next;
        }, this.getEntityTree());
    }

    reduceIdArray(idArr, action) {
        switch (action.type) {
        case CREATE:
            return [...idArr, this.nextId()];
        case DELETE:
            const idsToDelete = action.payload.idArr;
            return idArr.filter(id => !idsToDelete.includes(id));
        case ORDER:
            const entities = sortByAll(this.getFullEntities(), action.payload);
            return entities.map(entity => entity[this.getIdAttribute()]);
        default:
            return idArr;
        }
    }

    reduceEntityMap(entityMap, action) {
        switch (action.type) {
        case CREATE:
            const id = this.nextId();
            return {
                ...entityMap,
                [id]: Object.assign({}, action.payload),
            };
        case UPDATE:
            let mapper;
            if (typeof action.payload.updater === 'function') {
                mapper = action.payload.updater;
            } else {
                mapper = entity => Object.assign({}, entity, action.payload.updater);
            }
            const updatedMap = {};
            action.payload.idArr.forEach(_id => {
                updatedMap[_id] = mapper(entityMap[_id]);
            });

            return {
                ...entityMap,
                ...updatedMap,
            };
        case DELETE:
            const idsToDelete = action.payload.idArr;
            return omit(entityMap, idsToDelete);
        default:
            return entityMap;
        }
    }
};

EntityManager.createManager = function createManager(props) {
    const parent = this;

    function childConstructor() {
        parent.apply(this, arguments);
    }

    childConstructor.prototype = Object.create(parent.prototype);
    Object.assign(childConstructor.prototype, props);
    return childConstructor;
};

export default EntityManager;
